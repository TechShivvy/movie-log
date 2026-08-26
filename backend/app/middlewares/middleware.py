import time
import uuid
from typing import Awaitable, Callable

from fastapi import Request, Response
from loguru_setup import LOGGER
from starlette.datastructures import Headers
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send


async def log_request_info(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    # Attach a request-id so individual requests can be correlated across logs.
    request_id = request.headers.get('x-request-id') or str(uuid.uuid4())
    request.state.request_id = request_id

    start_time = time.monotonic_ns()
    response = await call_next(request)
    process_time = time.monotonic_ns() - start_time

    rounded_time = f'{process_time / 1_000_000_000:.4f}s'
    response.headers['X-Process-Time'] = rounded_time
    response.headers['X-Request-ID'] = request_id

    LOGGER.info(
        'rid={} Method={} Path={} StatusCode={} ProcessTime={}',
        request_id,
        request.method,
        request.url.path,
        response.status_code,
        rounded_time,
    )

    return response


# Conservative security headers for API responses. CSP for the web app itself is
# applied at its serving layer; these harden the API surface.
_SECURITY_HEADERS = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
    'Cross-Origin-Resource-Policy': 'same-site',
}


async def add_security_headers(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    """Attach conservative security headers to every response."""

    response = await call_next(request)
    for header, value in _SECURITY_HEADERS.items():
        response.headers.setdefault(header, value)
    return response


class _BodyTooLarge(Exception):
    """Internal sentinel — never escapes MaxBodySizeMiddleware.__call__."""


class MaxBodySizeMiddleware:
    """Caps request body size for non-multipart (JSON) requests.

    Without this, a request body is fully buffered and JSON-decoded before
    any per-field Pydantic max_length validator ever runs — confirmed live:
    a 5MB `notes` field was fully read into memory, parsed, *and echoed back
    in full* inside the resulting 422's validation error detail, for roughly
    1:1 reflection of an attacker's own request size back out as response
    size. Nothing capped it; MultiPartParser.max_part_size/spool_max_size
    (see routers/movie_metadata.py) only apply to that one multipart upload
    route, not to plain JSON bodies used everywhere else.

    A pure ASGI middleware (not the `@app.middleware('http')` / BaseHTTPMiddleware
    style used above) is required here on purpose: BaseHTTPMiddleware already
    buffers the *entire* body via `await request.body()` internally before your
    middleware function ever runs, which is exactly the cost this is meant to
    avoid. This wraps the raw ASGI `receive` callable instead, counting bytes
    as they actually arrive off the wire and aborting mid-stream if the
    caller keeps sending past the cap — not just trusting the Content-Length
    header, which a client can omit entirely or lie about under chunked
    transfer encoding.

    Response construction is handled *inside this class*, not by raising
    fastapi.HTTPException and letting the app's registered exception handlers
    deal with it (utils/errors.py). Tried that first — it doesn't work:
    middleware added via app.add_middleware() sits *outside*
    starlette.middleware.exceptions.ExceptionMiddleware (confirmed by reading
    the actual traceback: ServerErrorMiddleware calls straight into this
    class, ExceptionMiddleware is never in that call chain), so a raised
    HTTPException here is only ever caught by ServerErrorMiddleware's
    generic catch-all — a bare 500, not the intended 413. Catching our own
    sentinel and building the JSON response directly, in the same shape
    utils/errors.py uses elsewhere, sidesteps that entirely.
    """

    def __init__(self, app: ASGIApp, max_bytes: int) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope['type'] != 'http':
            await self.app(scope, receive, send)
            return

        headers = Headers(scope=scope)
        if headers.get('content-type', '').startswith('multipart/'):
            # Already capped separately (max_part_size/spool_max_size), and
            # those uploads are legitimately larger than any JSON body here.
            await self.app(scope, receive, send)
            return

        # Fast path: an honest (or simply non-adversarial) declared size lets
        # us reject before reading anything at all.
        content_length = headers.get('content-length')
        if content_length is not None:
            try:
                if int(content_length) > self.max_bytes:
                    await self._reject(scope, receive, send)
                    return
            except ValueError:
                pass  # Malformed header — fall through to the streaming check.

        total = 0

        async def limited_receive() -> Message:
            nonlocal total
            message = await receive()
            if message['type'] == 'http.request':
                total += len(message.get('body', b''))
                if total > self.max_bytes:
                    raise _BodyTooLarge()
            return message

        try:
            await self.app(scope, limited_receive, send)
        except _BodyTooLarge:
            # Safe to still emit a full response here: this only fires while
            # the downstream app is reading the *request* body, which always
            # happens before it sends any part of a response.
            await self._reject(scope, receive, send)

    async def _reject(self, scope: Scope, receive: Receive, send: Send) -> None:
        response = JSONResponse(
            status_code=413,
            content={
                'code': 'PAYLOAD_TOO_LARGE',
                'message': f'Request body must be smaller than {self.max_bytes} bytes.',
            },
        )
        await response(scope, receive, send)
