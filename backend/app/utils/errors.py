"""Uniform API error taxonomy and exception handlers.

All error responses share the shape::

    {"code": "SOME_CODE", "message": "human readable", "detail": <optional>}

This keeps client-side error handling predictable and lets the frontend map
specific codes (e.g. RATE_LIMIT_MINUTE vs QUOTA_DAILY_EXCEEDED) to tailored UX.
"""

from typing import Any, Optional

from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from loguru_setup import LOGGER
from slowapi.errors import RateLimitExceeded
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.requests import Request
from starlette.status import (
    HTTP_400_BAD_REQUEST,
    HTTP_401_UNAUTHORIZED,
    HTTP_403_FORBIDDEN,
    HTTP_404_NOT_FOUND,
    HTTP_408_REQUEST_TIMEOUT,
    HTTP_409_CONFLICT,
    HTTP_413_CONTENT_TOO_LARGE,
    HTTP_415_UNSUPPORTED_MEDIA_TYPE,
    HTTP_429_TOO_MANY_REQUESTS,
    HTTP_500_INTERNAL_SERVER_ERROR,
    HTTP_502_BAD_GATEWAY,
)


class APIError(Exception):
    """Application error carrying a stable machine-readable code."""

    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        detail: Any = None,
        headers: Optional[dict[str, str]] = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.detail = detail
        self.headers = headers or {}


# Default code for a given HTTP status when a plain HTTPException is raised.
_STATUS_CODE_MAP: dict[int, str] = {
    HTTP_400_BAD_REQUEST: 'BAD_REQUEST',
    HTTP_401_UNAUTHORIZED: 'UNAUTHORIZED',
    HTTP_403_FORBIDDEN: 'FORBIDDEN',
    HTTP_404_NOT_FOUND: 'NOT_FOUND',
    HTTP_408_REQUEST_TIMEOUT: 'REQUEST_TIMEOUT',
    HTTP_409_CONFLICT: 'CONFLICT',
    HTTP_413_CONTENT_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
    HTTP_415_UNSUPPORTED_MEDIA_TYPE: 'UNSUPPORTED_MEDIA_TYPE',
    HTTP_429_TOO_MANY_REQUESTS: 'RATE_LIMITED',
    HTTP_500_INTERNAL_SERVER_ERROR: 'INTERNAL_ERROR',
    HTTP_502_BAD_GATEWAY: 'UPSTREAM_ERROR',
}


def _body(code: str, message: str, detail: Any = None) -> dict[str, Any]:
    payload: dict[str, Any] = {'code': code, 'message': message}
    if detail is not None:
        payload['detail'] = detail
    return payload


async def api_error_handler(request: Request, exc: APIError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content=_body(exc.code, exc.message, exc.detail),
        headers=exc.headers,
    )


async def http_exception_handler(
    request: Request, exc: StarletteHTTPException
) -> JSONResponse:
    code = _STATUS_CODE_MAP.get(exc.status_code, 'ERROR')
    detail = exc.detail
    message = detail if isinstance(detail, str) else code
    body_detail = None if isinstance(detail, str) else detail
    return JSONResponse(
        status_code=exc.status_code,
        content=_body(code, message, body_detail),
        headers=getattr(exc, 'headers', None) or {},
    )


async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    # Pydantic error dicts may contain non-serializable Python objects (e.g.
    # ValueError instances in the 'ctx' field). Stringify them so json.dumps works.
    def _safe(obj: Any) -> Any:
        if isinstance(obj, dict):
            return {k: _safe(v) for k, v in obj.items()}
        if isinstance(obj, (list, tuple)):
            return [_safe(v) for v in obj]
        if isinstance(obj, Exception):
            return str(obj)
        return obj

    return JSONResponse(
        status_code=422,
        content=_body(
            'VALIDATION_ERROR', 'Request validation failed', _safe(exc.errors())
        ),
    )


async def rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    # This is the per-minute limiter (SlowAPI). It is distinct from the daily
    # quota (QUOTA_DAILY_EXCEEDED) enforced in services/quota.py.
    return JSONResponse(
        status_code=HTTP_429_TOO_MANY_REQUESTS,
        content=_body(
            'RATE_LIMIT_MINUTE',
            'Too many requests in a short time. Please slow down and retry shortly.',
            {'limit': str(exc.limit.limit)} if getattr(exc, 'limit', None) else None,
        ),
        headers={'Retry-After': '60'},
    )


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    # Never leak internals to the client; log full detail server-side.
    LOGGER.exception('Unhandled error while processing request')
    return JSONResponse(
        status_code=HTTP_500_INTERNAL_SERVER_ERROR,
        content=_body('INTERNAL_ERROR', 'An unexpected error occurred.'),
    )
