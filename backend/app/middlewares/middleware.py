import time
import uuid
from typing import Awaitable, Callable

from fastapi import Request, Response
from loguru_setup import LOGGER


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
