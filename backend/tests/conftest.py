"""Shared fixtures for the whole suite.

Integration tests run against the **real linked Supabase project** — see
tests/README.md for why (nearly every real bug this project has found was
only ever caught by live testing, never by reasoning about Python in
isolation). This file wires that up: an in-process ASGI client for the
real app, a throwaway-user factory with guaranteed cleanup, and an
admin-user variant for the handful of admin-gated routes.

Rate limiting is force-disabled for the whole run (env var set *before*
the app is ever imported — config/settings.py resolves it once at import
time) — it isn't the feature under test in nearly any of these, and
per-IP buckets would make anonymous-endpoint tests flaky when run back
to back. This must happen before any `app`/`config` import anywhere,
including transitively, so it's the very first thing this file does.
"""

import os

os.environ.setdefault('RATE_LIMIT_ENABLED', 'false')

import asyncio
import sys
import uuid
from pathlib import Path
from typing import AsyncIterator, Callable, Optional

import httpx
import pytest
import pytest_asyncio

# So `from config import settings`, `from app import app`, etc. resolve
# the same way they do for the running app itself — app/ isn't a
# package relative to backend/, it's the actual import root. Same
# pattern backend/scripts/*.py already use for the same reason.
_APP_DIR = Path(__file__).resolve().parent.parent / 'app'
sys.path.insert(0, str(_APP_DIR))
os.chdir(_APP_DIR)  # config/settings.py's YAML source loads relative to cwd

from app import app as fastapi_app  # noqa: E402
from config import settings  # noqa: E402
from httpx import ASGITransport  # noqa: E402


def _require_env(name: str) -> str:
    """Fetches a required config value from the already-resolved app
    settings, skipping the whole session with a clear message rather
    than failing every test cryptically if the suite is run somewhere
    unconfigured (e.g. no .env at all)."""

    value = getattr(settings, name, None)
    if value is None:
        pytest.skip(f'{name} is not configured — set it in backend/.env to run this suite.')
    return value.get_secret_value() if hasattr(value, 'get_secret_value') else value


def _admin_key() -> str:
    if settings.supabase_secret_key:
        return settings.supabase_secret_key.get_secret_value()
    if settings.supabase_service_role_key:
        return settings.supabase_service_role_key.get_secret_value()
    pytest.skip('Neither SUPABASE_SECRET_KEY nor SUPABASE_SERVICE_ROLE_KEY is configured.')


@pytest.fixture(scope='session', autouse=True)
def _check_env() -> None:
    """Runs once, before anything else — fails fast with a clear message
    if the suite can't possibly work, instead of 40 cryptic individual
    failures."""

    if not settings.supabase_url:
        pytest.skip('SUPABASE_URL is not configured — this suite needs a real linked project.')
    _admin_key()


@pytest_asyncio.fixture
async def client() -> AsyncIterator[httpx.AsyncClient]:
    """In-process ASGI client for the real app — no separate uvicorn
    process, no port to manage, still exercises the real app code and
    real outbound calls to Supabase. Lifespan (which launches 3 headless
    Chromium processes for link extraction) is deliberately NOT
    triggered — too slow/heavy and irrelevant to nearly every test; see
    tests/README.md for what that means link-extraction tests need."""

    # timeout=60.0, not httpx's 5s default: a real extraction call against
    # a real, detailed ticket image (as opposed to the tiny synthetic
    # images used where content doesn't matter) genuinely takes up to
    # ~15s for a real provider to process — confirmed live, a 5s default
    # was cutting these off mid-call. Matches the same order of magnitude
    # as gunicorn's own --timeout 60 in production (docker-entry.sh).
    transport = ASGITransport(app=fastapi_app)
    async with httpx.AsyncClient(transport=transport, base_url='http://test', timeout=60.0) as c:
        yield c


_AUTH_PACING_LOCK = asyncio.Lock()
_AUTH_PACING_MIN_INTERVAL = 0.35  # seconds between any two GoTrue auth calls, process-wide
_auth_last_call_at = [0.0]


async def _paced_auth_post(
    http: httpx.AsyncClient, url: str, *, headers: dict, json: dict, max_attempts: int = 6,
) -> httpx.Response:
    """POSTs to a Supabase GoTrue auth endpoint (admin user-create or
    password-grant login), paced against every other such call this test
    process makes (a shared min-interval gate, not per-call), plus
    retry/backoff on 429 as a fallback.

    Confirmed live: running the full suite creates 100+ throwaway users
    back to back (see _UserFactory below), and GoTrue's per-project rate
    limit genuinely can't absorb that as one uncontrolled burst — it
    starts 429ing partway through. Pacing keeps us under the limit in the
    first place; the retry loop is only a safety net for whatever
    slips through (e.g. concurrent xdist workers, if ever used). This
    isn't a bug in the app under test, just real infrastructure a
    real-world client hitting the same endpoint would also have to
    respect."""

    delay = 1.0
    resp: Optional[httpx.Response] = None
    for attempt in range(max_attempts):
        async with _AUTH_PACING_LOCK:
            await _wait_out_auth_pacing()
            resp = await http.post(url, headers=headers, json=json)
            _auth_last_call_at[0] = asyncio.get_event_loop().time()
        if resp.status_code != 429:
            return resp
        if attempt == max_attempts - 1:
            return resp
        retry_after = resp.headers.get('retry-after')
        wait = float(retry_after) if retry_after else delay
        await asyncio.sleep(wait)
        delay = min(delay * 2, 30.0)
    return resp


async def _wait_out_auth_pacing() -> None:
    """Must be called with _AUTH_PACING_LOCK already held."""

    now = asyncio.get_event_loop().time()
    wait = _auth_last_call_at[0] + _AUTH_PACING_MIN_INTERVAL - now
    if wait > 0:
        await asyncio.sleep(wait)


async def _paced_auth_delete(http: httpx.AsyncClient, url: str, *, headers: dict) -> httpx.Response:
    """Same pacing gate as _paced_auth_post, for the admin user-delete
    calls cleanup() makes — they hit the same GoTrue admin bucket."""

    async with _AUTH_PACING_LOCK:
        await _wait_out_auth_pacing()
        resp = await http.delete(url, headers=headers)
        _auth_last_call_at[0] = asyncio.get_event_loop().time()
    return resp


class _UserFactory:
    """Creates throwaway Supabase users via the Admin API (sidesteps the
    project's email rate limit — same reasoning as every manual
    verification this whole project has used), tracks every one created
    so the fixture teardown can delete them all, even if a test fails
    partway through and never gets to clean up itself."""

    def __init__(self, http: httpx.AsyncClient, base_url: str, admin_key: str):
        self._http = http
        self._base_url = base_url.rstrip('/')
        self._admin_key = admin_key
        self.created_user_ids: list[str] = []

    async def __call__(self, *, email: Optional[str] = None) -> tuple[str, str]:
        """Returns (user_id, access_token)."""

        email = email or f'pytest-{uuid.uuid4().hex[:16]}@example.com'
        password = 'TestPass123!'
        headers = {
            'apikey': self._admin_key,
            'Authorization': f'Bearer {self._admin_key}',
            'Content-Type': 'application/json',
        }
        create = await _paced_auth_post(
            self._http, f'{self._base_url}/auth/v1/admin/users',
            headers=headers,
            json={'email': email, 'password': password, 'email_confirm': True},
        )
        create.raise_for_status()
        user_id = create.json()['id']
        self.created_user_ids.append(user_id)

        token_resp = await _paced_auth_post(
            self._http, f'{self._base_url}/auth/v1/token?grant_type=password',
            headers={'apikey': self._admin_key, 'Content-Type': 'application/json'},
            json={'email': email, 'password': password},
        )
        token_resp.raise_for_status()
        return user_id, token_resp.json()['access_token']

    async def cleanup(self) -> None:
        headers = {'apikey': self._admin_key, 'Authorization': f'Bearer {self._admin_key}'}
        for user_id in self.created_user_ids:
            try:
                # Hard-delete this user's movie_logs *before* deleting the
                # user itself. movie_logs.user_id (and visit_venue_ratings.
                # user_id) is `on delete set null`, not cascade — by design
                # (see supabase/migrations/20260813000001), a real user's
                # PUBLIC/ANONYMOUS logs are meant to survive their own
                # account deletion, anonymized, so venue stats and other
                # people's feeds don't retroactively lose data. That's
                # correct for real users but wrong for test data: skipping
                # this step left ~195 orphaned test logs (and the theatres
                # some of them referenced) permanently sitting in the real
                # public feed/search/venue-stats surface — found live,
                # cleaned up once by hand, and this is what stops it from
                # recurring on every future test run. Delete-before-cascade
                # here also handles the private-logs case for free: the
                # app's own DELETE /auth/me hard-deletes private logs via
                # its own code path (services/supabase_rest.py:
                # delete_private_movie_logs) before ever reaching the DB
                # cascade, but this fixture goes straight through the Auth
                # Admin API and never runs that endpoint at all — without
                # this, a test user's private logs would *also* end up
                # orphaned-with-user_id-null instead of gone (harmless
                # since visibility stays 'private', so RLS/views still
                # never surface them, but still wasted rows).
                await self._http.delete(
                    self._rest_url('/movie_logs'),
                    headers={**headers, 'Prefer': 'return=minimal'},
                    params={'user_id': f'eq.{user_id}'},
                )
            except httpx.HTTPError:
                pass  # Best-effort — see the broad except on the user-delete call below.
            try:
                # Same class of gap the movie_logs delete above closes,
                # for Storage specifically: auto-insert (services/
                # auto_insert.py) is the first thing that's ever made the
                # backend write to Storage — nothing needed this cleanup
                # before it existed. Without it, every test exercising
                # auto-insert leaks a real object into the linked
                # project's ticket-images bucket on every run.
                from services import supabase_admin
                await supabase_admin.delete_user_storage(user_id)
            except Exception:
                pass  # Best-effort, same reasoning as the rest of this loop.
            try:
                await _paced_auth_delete(
                    self._http, f'{self._base_url}/auth/v1/admin/users/{user_id}', headers=headers,
                )
            except httpx.HTTPError:
                pass  # Best-effort — a leftover throwaway test user is inert clutter, not a correctness problem.

    def _rest_url(self, path: str) -> str:
        return f'{self._base_url}/rest/v1{path}'


@pytest_asyncio.fixture
async def make_user() -> AsyncIterator[Callable]:
    """Async factory fixture: `user_id, token = await make_user()`.
    Every user created through it is deleted in teardown automatically —
    tests never need to clean up their own throwaway users."""

    admin_key = _admin_key()
    async with httpx.AsyncClient(timeout=15.0) as http:
        factory = _UserFactory(http, settings.supabase_url, admin_key)
        yield factory
        await factory.cleanup()


@pytest_asyncio.fixture
async def admin_user(make_user) -> AsyncIterator[tuple[str, str]]:
    """Like make_user, but the created user's id is temporarily added to
    ADMIN_USER_IDS for the duration of the test — needed for the handful
    of admin-gated routes (report triage, venue lifecycle status).
    Settings is frozen (config/settings.py), so this bypasses that via
    object.__setattr__ — the same technique settings.py's own LOCAL-only
    auto-generated-encryption-key validator already uses for the same
    reason — and always restores the original allowlist in teardown,
    even if the test fails."""

    user_id, token = await make_user()
    original = settings.admin_user_ids
    object.__setattr__(settings, 'admin_user_ids', (*original, user_id))
    try:
        yield user_id, token
    finally:
        object.__setattr__(settings, 'admin_user_ids', original)


# theatres (and screens) are shared directory data, not user-owned —
# theatres.created_by is `on delete set null` (an attribution column, not
# ownership; see supabase/migrations/20260813000001), so deleting the
# creating test user never removes a theatre a test created. Found live:
# 34 synthetic test theatres (one of them a real Google Places row) had
# been silently accumulating in the real linked project across this
# session's test runs, cleaned up once by hand. Tests should tag any
# theatre name they invent with this suffix (`f'{name}{THEATRE_TEST_TAG}'`)
# so _cleanup_test_theatres can find and remove it at the end of the run;
# a theatre whose name is server-authoritative (a real Google Places
# result, so the client's own name is discarded — see
# test_create_theatre_with_a_real_place_id_populates_authoritative_fields)
# can't be tagged this way and must delete itself directly by id instead.
THEATRE_TEST_TAG = ' [pytest]'


def theatre_place_payload(name_prefix: str = 'Log Test Theatre') -> dict:
    """A minimal inline `theatre_place` (see MovieLogInput.theatre_place)
    for tests that just need POST/PATCH /movie-logs' required-theatre check
    (routers/movie_logs.py) satisfied and don't care which venue — same
    Places-unconfigured/lookup-failure fallback path as
    test_venues.py's own falls-back-to-submitted-data test, just packaged
    as the inline shape movie-log create/update accepts instead of a
    separate POST /venues/theatres call. Tagged with THEATRE_TEST_TAG so
    _cleanup_test_theatres below removes the ad-hoc theatre (and any log
    still referencing it) at session end, same as every other test-created
    theatre."""
    return {
        'place_id': f'pytest-{uuid.uuid4().hex[:10]}',
        'name': f'{name_prefix}{THEATRE_TEST_TAG}',
    }


@pytest.fixture(scope='session', autouse=True)
def _cleanup_test_theatres() -> AsyncIterator[None]:
    yield

    async def _sweep() -> None:
        key = _admin_key()
        base = settings.supabase_url.rstrip('/')
        headers = {'apikey': key, 'Authorization': f'Bearer {key}', 'Prefer': 'return=representation'}
        async with httpx.AsyncClient(timeout=30.0) as http:
            # theatre_id on movie_logs has no ON DELETE action (implicit
            # RESTRICT) — any tagged theatre still referenced by a
            # movie_log (itself already meant to be gone via
            # _UserFactory.cleanup, but best-effort in case a test failed
            # before reaching its own teardown) would otherwise 409 on the
            # theatre delete below. PostgREST has no subquery filter, so
            # this is list-then-delete-each rather than one bulk delete.
            listed = await http.get(
                f'{base}/rest/v1/theatres', headers=headers,
                params={'name': f'like.*{THEATRE_TEST_TAG}', 'select': 'id'},
            )
            ids = [row['id'] for row in listed.json()] if listed.status_code == 200 else []
            for theatre_id in ids:
                await http.delete(
                    f'{base}/rest/v1/movie_logs', headers=headers,
                    params={'theatre_id': f'eq.{theatre_id}'},
                )
                await http.delete(
                    f'{base}/rest/v1/theatres', headers=headers, params={'id': f'eq.{theatre_id}'},
                )

    asyncio.run(_sweep())


async def delete_theatre_by_id(theatre_id: str) -> None:
    """For the one case THEATRE_TEST_TAG can't cover: a theatre whose name
    came back server-authoritative from a real Google Places lookup, so
    the client never controlled it. Callers (e.g. the real-place-id test
    in test_venues.py) call this directly in their own cleanup instead of
    relying on the name-based sweep above."""

    key = _admin_key()
    base = settings.supabase_url.rstrip('/')
    headers = {'apikey': key, 'Authorization': f'Bearer {key}', 'Prefer': 'return=minimal'}
    async with httpx.AsyncClient(timeout=15.0) as http:
        await http.delete(f'{base}/rest/v1/movie_logs', headers=headers, params={'theatre_id': f'eq.{theatre_id}'})
        await http.delete(f'{base}/rest/v1/theatres', headers=headers, params={'id': f'eq.{theatre_id}'})


# Real ticket photos (backend/test-images/) — the canonical fixtures
# this whole project's manual testing has used since before this pytest
# suite existed (ticket-1.png is the exact "Ekkadiki Pothavu Chinnavada"
# example already baked into the API's own OpenAPI response examples;
# ticket-2.png's Baahubali booking matches the real rows still sitting in
# movie_logs from actual dev usage). Needed as a real, distinct fixture
# from the tiny synthetic images used elsewhere in this suite once the
# NOT_A_TICKET check (schemas/movie_metadata.py) shipped — confirmed
# live, a real model reliably (and correctly) flags a blank/featureless
# test image as not a ticket, so any test asserting a real successful
# extraction needs genuine ticket content to extract, not a 1x1 pixel.
_TEST_IMAGES_DIR = Path(__file__).resolve().parent.parent / 'test-images'


def real_ticket_image_bytes(name: str = 'ticket-1.png') -> bytes:
    return (_TEST_IMAGES_DIR / name).read_bytes()


def personal_test_key(name: str) -> Optional[str]:
    """Reads a personal test API key (OPENROUTER_API_KEY_1,
    OPENAI_API_KEY_1, GEMINI_API_KEY_1, ...) directly from the process
    environment / .env — these are throwaway keys for live-testing the
    LLM provider paths, never the backend's own shared/paid
    OPENROUTER_API_KEY, which no test ever touches. Returns None (callers
    should skip) if not configured, rather than failing every @pytest.mark.llm
    test with a confusing error."""

    from dotenv import dotenv_values

    value = os.environ.get(name)
    if value:
        return value
    env_path = Path(__file__).resolve().parent.parent / '.env'
    return dotenv_values(env_path).get(name)


@pytest.fixture
def patch_settings() -> Callable:
    """Temporarily overrides fields on the real `settings` object and
    restores every one of them afterward, even on failure.

    Settings is `frozen=True` (config/settings.py) — regular
    `monkeypatch.setattr(settings, ...)` raises `pydantic_core.ValidationError:
    Instance is frozen` (confirmed live), since both setting and
    monkeypatch's own restore go through pydantic's `__setattr__`
    override. This bypasses that via `object.__setattr__`, the same
    technique settings.py's own LOCAL-only auto-generated-encryption-key
    validator and this file's `admin_user` fixture already use for the
    same reason.

    Usage: `patch_settings(llm_key_encryption_key=None)`.
    """

    originals: dict[str, object] = {}

    def _patch(**kwargs) -> None:
        for name, value in kwargs.items():
            if name not in originals:  # only remember the *first* original value
                originals[name] = getattr(settings, name)
            object.__setattr__(settings, name, value)

    yield _patch

    for name, value in originals.items():
        object.__setattr__(settings, name, value)
