"""Extracts the visible text of a shared movie-ticket confirmation page
(BookMyShow, Fandango, PVR, District, ...) via a real headless browser, so
it can be handed to the same LLM extraction pipeline /extract uses for
ticket photos.

Why a real browser instead of a plain HTTP fetch: verified live against
real BookMyShow and Fandango links — both render their booking details via
client-side JavaScript after the initial HTML loads. A plain GET returns
an empty shell (Fandango) or an outright Cloudflare bot-challenge page
(BookMyShow, which a stock non-JS-executing client fails automatically).
Chromium via Playwright, with no stealth/evasion tooling at all, passes
Cloudflare's challenge simply by being a real browser that executes real
JS — this isn't bot-evasion, it's just browsing normally.

Why plain visible text, not raw HTML, gets handed to the LLM: `inner_text`
on the rendered page is exactly what a human looking at the screen would
see — the same information a ticket *photo* would show, which is what the
existing image-extraction prompt/schema is already built around. Raw HTML
would be mostly presentation markup, inline scripts/styles, and tracking
noise irrelevant to the ticket fields, at many times the token cost, with
extra prompt-injection surface (a malicious/compromised page could embed
"instructions" in an inline <script> or hidden element) for no benefit —
verified live that plain text alone was already unambiguous and complete
on both real sample sites, each fact on its own clearly-labeled line.

=== Why the sync API, in one dedicated background thread, not asyncio ===

Started with Playwright's async API (matching the rest of this async
FastAPI app) and hit a genuine Windows-only wall: uvicorn's --reload
supervisor spawns each worker as a fresh interpreter via
`multiprocessing`, and CPython's own `multiprocessing.spawn` builds that
child's command line with `-S` (skip site init) on Windows — so there's
no reachable hook to fix the event loop policy before uvicorn's own
`asyncio.run()` creates the (wrong) SelectorEventLoop in that process,
which can't create subprocesses at all
(`asyncio.create_subprocess_exec` -> NotImplementedError). That's exactly
what Playwright's async API needs to launch its Node-based browser
driver. Doesn't affect Linux/prod (no such loop split there) or local
dev without --reload, but --reload is worth keeping for everything else.

Playwright's sync API sidesteps this entirely — its driver connection
uses plain `subprocess.Popen`, not asyncio, so it has no event-loop-type
dependency at all. The tradeoff: sync Playwright objects (Browser,
BrowserContext, Page) have thread affinity — every call on them must
happen on the exact OS thread that created the connection. So this
module runs a small pool of dedicated background threads (_WORKER_COUNT),
each with its OWN independent Browser instance for its entire lifetime,
pulling scrape requests off one shared queue, and bridging results back
into the async world via concurrent.futures.Future + asyncio.wrap_future().
This gives real parallel scraping (up to _WORKER_COUNT at once) on every
platform this runs on, not just where the async API happens to work —
the Windows/--reload problem above is specifically about which API to
call, not about how much concurrency to allow; conflating the two would
have accidentally serialized this in production too, where the bug that
justified switching away from the async API doesn't even exist.

=== Security model (server-side navigation to a user-supplied URL is an
SSRF vector — this is designed around that, not around "is Chromium's own
sandbox strong enough") ===

1. Domain allowlist, checked BEFORE ever queuing a scrape job: the
   submitted URL's host must match a known ticketing domain (_ALLOWED_HOSTS).
   Rejects anything else outright — no LLM call, no quota spent, no
   browser page opened.
2. The allowlist alone isn't enough: these are shortlinks that redirect
   (fand.co -> tickets.fandango.com), and Playwright would otherwise
   happily follow a redirect anywhere, including to an internal address
   an attacker controls via an open-redirect-style link. Every single
   outgoing request the browser makes — the navigation, every redirect
   hop, every sub-resource — is intercepted via page.route() and checked
   in _guard_request() before being allowed through.
3. DNS-rebinding defense: an allowlisted-looking hostname could still
   resolve to a private/internal IP (cloud metadata service at
   169.254.169.254, localhost, RFC1918 ranges) if DNS is attacker-
   controlled or rebound after the initial check. _guard_request()
   resolves every request's hostname and rejects anything that resolves
   to a non-public IP, regardless of whether the hostname matched the
   domain allowlist — this is checked for every request, not just the
   main navigation, and is the actual SSRF stopgap; the domain allowlist
   above is a coarser, cheaper first filter, not a substitute for it.
4. No credentials, no persistence: every scrape gets a brand new
   BrowserContext (fresh cookies/storage), closed immediately after,
   never reused across requests or shared with any other caller.
   Downloads, popups, and all browser permissions (geolocation, camera,
   clipboard, ...) are denied on the context.
5. Resource limits: Playwright's own per-navigation timeout
   (_NAV_TIMEOUT_MS) bounds each job even under adversarial input (a
   hanging page can't block a worker thread forever), plus an outer
   wall-clock budget (_SCRAPE_BUDGET_S) on the async side as defense in
   depth. Concurrency itself is capped at _WORKER_COUNT (see API note
   above) — a burst of link submissions queues past that, rather than
   spinning up unbounded concurrent browser processes.
6. Process-level sandboxing: the browser is launched WITHOUT
   `--no-sandbox`, so Chromium's own OS-level sandbox (which that flag
   would otherwise disable) stays active. This needs the container to run
   as a non-root user with normal namespace permissions — already true
   here (Dockerfiles run as `appuser`) — rather than quietly falling back
   to `--no-sandbox` if launch fails, which would be a silent security
   downgrade; if that ever happens on a given host, it needs a conscious
   decision, not an automatic one, so this module does not catch and
   retry with --no-sandbox on failure.
7. Nothing from the page is ever persisted beyond the single request:
   only the final structured MovieMetadata fields the LLM extracts get
   cached (services/extraction_cache.py, unchanged) — the raw scraped
   text itself is never logged or stored, so an accidental PII leak in
   the source page (verified live: Fandango's confirmation page includes
   the original buyer's email and last-4 card digits, unprompted) can't
   end up sitting in our own database or logs.

One thing this module deliberately does NOT try to defend against: the
LLM being shown attacker-crafted "instructions" hidden in the page text
(prompt injection). That risk exists regardless of text vs HTML and isn't
specific to this feature — the mitigation is the same one /extract
already relies on: the LLM's output is always forced through the
MovieMetadata schema and never given any tool/action authority, so the
worst case is wrong/junk extracted fields, not an executed instruction.
"""

import asyncio
import ipaddress
import queue
import socket
import sys
import threading
import time
from concurrent.futures import Future
from dataclasses import dataclass
from urllib.parse import urlparse

from loguru_setup import LOGGER
from playwright.sync_api import Browser, Route, sync_playwright
from utils.errors import APIError

# Known ticketing platforms + their official shortlink domains. Adding a
# new site is just adding its host(s) here — the scrape itself is
# generic (navigate, wait, grab visible text), no site-specific DOM
# selectors needed; verified live that plain inner_text() already comes
# out clean and unambiguous on both BookMyShow and Fandango. Per-domain
# entries can override the default wait strategy where a site's page
# never reaches Playwright's "networkidle" (verified live: BookMyShow's
# booking-details page has ongoing background polling that never goes
# idle — needs 'domcontentloaded' + a fixed extra wait instead).
@dataclass(frozen=True)
class _SiteConfig:
    wait_until: str = 'networkidle'
    extra_wait_ms: int = 2000


_ALLOWED_HOSTS: dict[str, _SiteConfig] = {
    # India
    'bmsurl.co': _SiteConfig(wait_until='domcontentloaded', extra_wait_ms=4000),
    'in.bookmyshow.com': _SiteConfig(wait_until='domcontentloaded', extra_wait_ms=4000),
    'bookmyshow.com': _SiteConfig(wait_until='domcontentloaded', extra_wait_ms=4000),
    'pvrcinemas.com': _SiteConfig(),
    'district.in': _SiteConfig(),
    # US / international
    'fand.co': _SiteConfig(),
    'fandango.com': _SiteConfig(),
    'tickets.fandango.com': _SiteConfig(),
    'amctheatres.com': _SiteConfig(),
    'cinemark.com': _SiteConfig(),
    'regmovies.com': _SiteConfig(),
    'odeon.co.uk': _SiteConfig(),
}

_ALLOWED_SCHEMES = {'http', 'https'}
_SCRAPE_BUDGET_S = 30.0
_NAV_TIMEOUT_MS = 20000
_MAX_TEXT_CHARS = 20000
_STARTUP_TIMEOUT_S = 30.0
_SHUTDOWN_TIMEOUT_S = 10.0


def _host_allowed(host: str) -> _SiteConfig | None:
    host = host.lower()
    if host in _ALLOWED_HOSTS:
        return _ALLOWED_HOSTS[host]
    # Allow subdomains of an allowlisted registrable domain (e.g.
    # "some-region.district.in") without needing every subdomain listed
    # individually, without accidentally matching "evil-district.in".
    for allowed, cfg in _ALLOWED_HOSTS.items():
        if host.endswith('.' + allowed):
            return cfg
    return None


def _resolves_to_public_ip(host: str) -> bool:
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        return False
    for _family, _type, _proto, _canon, sockaddr in infos:
        ip_str = sockaddr[0]
        try:
            ip = ipaddress.ip_address(ip_str)
        except ValueError:
            return False
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_multicast
            or ip.is_reserved
            or ip.is_unspecified
        ):
            return False
    return True


def validate_link(url: str) -> _SiteConfig:
    """Cheap, pre-browser check: scheme + host allowlist. Raises APIError
    (400, UNSUPPORTED_LINK) rather than ever queuing a scrape job for a
    URL that was never going to be allowed through anyway."""

    parsed = urlparse(url)
    if parsed.scheme not in _ALLOWED_SCHEMES or not parsed.hostname:
        raise APIError(
            400, 'UNSUPPORTED_LINK', 'Only http(s) links to a supported ticketing site are accepted.'
        )
    cfg = _host_allowed(parsed.hostname)
    if cfg is None:
        raise APIError(
            400,
            'UNSUPPORTED_LINK',
            f'{parsed.hostname} is not a supported ticketing site yet.',
        )
    return cfg


def _guard_request(route: Route) -> None:
    """page.route() handler run for every request the page makes — the
    main navigation, every redirect hop, every sub-resource. This is the
    real SSRF stopgap (module docstring points 2-3), not the allowlist in
    validate_link(), which only ever sees the URL the caller submitted."""

    request = route.request
    parsed = urlparse(request.url)

    if parsed.scheme not in _ALLOWED_SCHEMES or not parsed.hostname:
        route.abort()
        return

    # Main-document requests (the initial navigation and every redirect
    # hop) must stay on an allowlisted ticketing domain. Sub-resources
    # (images/CSS/fonts/the page's own XHR calls, which BOTH real sample
    # sites need to actually populate the visible text) are allowed off-
    # domain — CDNs are normal — but still go through the public-IP check
    # below, which is what actually matters for SSRF: it doesn't matter
    # whose domain a request claims to be, only whether it resolves
    # somewhere on the public internet.
    if request.is_navigation_request() and _host_allowed(parsed.hostname) is None:
        LOGGER.warning('ticket_link_extractor: blocked off-allowlist navigation to {}', request.url)
        route.abort()
        return

    if not _resolves_to_public_ip(parsed.hostname):
        LOGGER.warning(
            'ticket_link_extractor: blocked request resolving to a non-public address: {}',
            request.url,
        )
        route.abort()
        return

    route.continue_()


def _scrape(browser: Browser, url: str, cfg: _SiteConfig) -> str:
    context = browser.new_context(
        user_agent=(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
            '(KHTML, like Gecko) Chrome/120.0 Safari/537.36'
        ),
        accept_downloads=False,
        permissions=[],
    )
    try:
        page = context.new_page()

        # Any *extra* page/tab the site tries to pop open (window.open,
        # target=_blank) is closed immediately — we only ever read the
        # one page we navigated to ourselves. Registered after
        # new_page() and checked by identity, not just registration
        # order: context.on('page', ...) fires for every page created in
        # this context, including the one we just made ourselves above —
        # closing indiscriminately would close our own page out from
        # under page.goto() before it ever navigates (hit this live).
        context.on('page', lambda p: p.close() if p is not page else None)

        page.route('**/*', _guard_request)

        start = time.monotonic()
        page.goto(url, wait_until=cfg.wait_until, timeout=_NAV_TIMEOUT_MS)
        elapsed_ms = (time.monotonic() - start) * 1000
        remaining_ms = _SCRAPE_BUDGET_S * 1000 - elapsed_ms
        if cfg.extra_wait_ms and remaining_ms > 0:
            page.wait_for_timeout(min(cfg.extra_wait_ms, remaining_ms))

        return page.inner_text('body')
    finally:
        context.close()


@dataclass
class _Job:
    url: str
    cfg: _SiteConfig
    future: Future[str]


# Real parallelism, on every platform: N dedicated threads, each with
# its OWN independent Browser instance, all pulling from one shared
# queue — not a Windows-specific limitation. (The switch to the sync API
# was purely to fix a Windows+--reload subprocess bug; it says nothing
# about how many browsers/threads to run, which is a separate choice.) A
# single-page-per-thread pool is a coarser unit of concurrency than
# async's "many pages on one browser" would give, at the cost of N
# separate Chromium processes instead of N pages sharing one — an
# acceptable tradeoff for what's an optional, moderate-volume input path,
# not the primary one.
_WORKER_COUNT = 3
_job_queue: queue.Queue[_Job | None] = queue.Queue()
_worker_threads: list[threading.Thread] = []


def _worker_loop(startup_future: Future[bool]) -> None:
    # Windows only: even Playwright's *sync* API runs its Node-driver
    # connection over its own internal asyncio loop under the hood (via a
    # greenlet) — asyncio.new_event_loop() picks up whatever the process-
    # wide event loop policy currently is. Verified live that under
    # `uvicorn --reload` specifically, that policy resolves to
    # SelectorEventLoop in this thread (a side effect of how
    # multiprocessing spawns the reload worker on Windows), which can't
    # create subprocesses — exactly what the driver connection needs.
    # This thread hasn't created a loop yet at this point (Playwright is
    # about to make the first one, inside sync_playwright() below), so
    # setting the policy right here — before that happens, and confined
    # to this one background thread's effect on future new_event_loop()
    # calls — reliably fixes it without touching uvicorn's own already-
    # running main-thread loop. No effect on Linux/prod, where this
    # Proactor/Selector split doesn't exist.
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

    try:
        with sync_playwright() as p:
            # No --no-sandbox: see module docstring point 6. If this
            # fails on a given host because the container can't create
            # the sandbox's user namespace, that's surfaced through
            # startup_future as a failure, not silently patched over.
            browser = p.chromium.launch(headless=True)
            startup_future.set_result(True)
            LOGGER.info('ticket_link_extractor: browser launched')

            while True:
                job = _job_queue.get()
                if job is None:  # shutdown sentinel
                    break
                try:
                    job.future.set_result(_scrape(browser, job.url, job.cfg))
                except Exception as exc:  # noqa: BLE001 - relayed to the waiting async caller, not swallowed
                    job.future.set_exception(exc)

            browser.close()
    except Exception as exc:
        if not startup_future.done():
            startup_future.set_exception(exc)
        LOGGER.exception('ticket_link_extractor: worker thread failed: {}', exc)
    finally:
        LOGGER.info('ticket_link_extractor: browser closed')


async def init_browser() -> None:
    global _worker_threads
    if _worker_threads:
        return

    startup_futures: list[Future[bool]] = [Future() for _ in range(_WORKER_COUNT)]
    threads = [
        threading.Thread(
            target=_worker_loop, args=(f,), name=f'ticket-link-extractor-{i}', daemon=True
        )
        for i, f in enumerate(startup_futures)
    ]
    for t in threads:
        t.start()

    results = await asyncio.gather(
        *(asyncio.wait_for(asyncio.wrap_future(f), timeout=_STARTUP_TIMEOUT_S) for f in startup_futures),
        return_exceptions=True,
    )
    succeeded = [t for t, r in zip(threads, results) if not isinstance(r, Exception)]
    failed = len(threads) - len(succeeded)
    if failed:
        LOGGER.warning('ticket_link_extractor: {}/{} worker threads failed to start', failed, len(threads))
    if not succeeded:
        raise RuntimeError('All ticket-link-extractor worker threads failed to start')

    _worker_threads = succeeded


async def close_browser() -> None:
    global _worker_threads
    if not _worker_threads:
        return
    for _ in _worker_threads:
        _job_queue.put(None)  # one sentinel per thread, so each exits exactly once
    await asyncio.gather(
        *(asyncio.to_thread(t.join, _SHUTDOWN_TIMEOUT_S) for t in _worker_threads)
    )
    _worker_threads = []


async def extract_visible_text(url: str) -> str:
    """Validate + scrape url, returning its rendered visible text. Raises
    APIError(422, LINK_EXTRACTION_FAILED) on any failure — timeout,
    navigation blocked, empty page — so callers can surface a clean
    "couldn't read that link, try uploading a photo instead" to the
    frontend rather than a raw 500."""

    if not any(t.is_alive() for t in _worker_threads):
        raise APIError(500, 'INTERNAL_ERROR', 'Link extraction is not available right now.')

    cfg = validate_link(url)

    result_future: Future[str] = Future()
    _job_queue.put(_Job(url=url, cfg=cfg, future=result_future))

    try:
        text = await asyncio.wait_for(asyncio.wrap_future(result_future), timeout=_SCRAPE_BUDGET_S + 10)
    except Exception as exc:
        LOGGER.warning('ticket_link_extractor: scrape failed for {}: {}', url, exc)
        raise APIError(
            422,
            'LINK_EXTRACTION_FAILED',
            "Couldn't read that link — try uploading a photo of the ticket instead.",
        ) from exc

    text = text.strip()
    if not text:
        raise APIError(
            422,
            'LINK_EXTRACTION_FAILED',
            "That link didn't have any readable content — try uploading a photo of the ticket instead.",
        )
    return text[:_MAX_TEXT_CHARS]
