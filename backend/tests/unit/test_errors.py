"""utils/errors.py — the uniform {code, message, detail?} envelope every
error response is supposed to share, regardless of which of the five
handlers actually produced it. Previously untested directly: every other
test file only observes this indirectly (asserting response.json()['code']
after some indirect error). Pure functions, no I/O — `request` is unused
in every handler body, so a plain `None` stands in for a real Request.
"""

import pytest
from fastapi.exceptions import RequestValidationError
from slowapi.errors import RateLimitExceeded
from starlette.exceptions import HTTPException as StarletteHTTPException

from utils.errors import (
    APIError,
    api_error_handler,
    http_exception_handler,
    rate_limit_handler,
    unhandled_exception_handler,
    validation_exception_handler,
)


@pytest.mark.asyncio
async def test_api_error_handler_carries_its_own_code_and_omits_detail_when_none():
    exc = APIError(404, 'NOT_FOUND', 'Theatre not found.')
    response = await api_error_handler(None, exc)
    assert response.status_code == 404
    import json
    body = json.loads(response.body)
    assert body == {'code': 'NOT_FOUND', 'message': 'Theatre not found.'}
    assert 'detail' not in body


@pytest.mark.asyncio
async def test_api_error_handler_includes_detail_when_given():
    exc = APIError(400, 'BAD_REQUEST', 'Bad input.', detail={'field': 'query'})
    response = await api_error_handler(None, exc)
    import json
    body = json.loads(response.body)
    assert body['detail'] == {'field': 'query'}


@pytest.mark.asyncio
async def test_http_exception_with_string_detail_becomes_the_message():
    """A plain `raise HTTPException(400, 'Model must not be empty.')` —
    used throughout routers/ where a stable machine code isn't worth a
    dedicated APIError — must still produce the uniform envelope, with
    the string detail promoted to `message` and the status-code-derived
    code filled in from _STATUS_CODE_MAP."""

    exc = StarletteHTTPException(status_code=400, detail='Model must not be empty.')
    response = await http_exception_handler(None, exc)
    import json
    body = json.loads(response.body)
    assert body == {'code': 'BAD_REQUEST', 'message': 'Model must not be empty.'}


@pytest.mark.asyncio
async def test_http_exception_with_non_string_detail_goes_to_detail_not_message():
    exc = StarletteHTTPException(status_code=404, detail={'reason': 'gone'})
    response = await http_exception_handler(None, exc)
    import json
    body = json.loads(response.body)
    assert body['code'] == 'NOT_FOUND'
    assert body['message'] == 'NOT_FOUND'  # falls back to the code itself, not the dict
    assert body['detail'] == {'reason': 'gone'}


@pytest.mark.asyncio
async def test_http_exception_unmapped_status_falls_back_to_generic_error_code():
    exc = StarletteHTTPException(status_code=418, detail="I'm a teapot")
    response = await http_exception_handler(None, exc)
    import json
    body = json.loads(response.body)
    assert body['code'] == 'ERROR'  # 418 isn't in _STATUS_CODE_MAP


@pytest.mark.asyncio
async def test_validation_exception_handler_is_always_422_with_stringified_errors():
    try:
        raise ValueError('not a valid enum value')
    except ValueError as ve:
        # Mirrors the real shape: a pydantic error dict's 'ctx' can hold a
        # raw exception instance, which json.dumps can't serialize as-is —
        # the handler's _safe() must stringify it recursively.
        errors = [{'type': 'value_error', 'loc': ('body', 'provider'), 'ctx': {'error': ve}}]
    exc = RequestValidationError(errors)
    response = await validation_exception_handler(None, exc)
    assert response.status_code == 422
    import json
    body = json.loads(response.body)
    assert body['code'] == 'VALIDATION_ERROR'
    assert body['detail'][0]['ctx']['error'] == 'not a valid enum value'  # stringified, not raw


@pytest.mark.asyncio
async def test_rate_limit_handler_is_429_with_retry_after_header():
    class _FakeLimit:
        limit = '5 per 1 minute'
        error_message = None

    exc = RateLimitExceeded(_FakeLimit())
    response = await rate_limit_handler(None, exc)
    assert response.status_code == 429
    assert response.headers['retry-after'] == '60'
    import json
    body = json.loads(response.body)
    assert body['code'] == 'RATE_LIMIT_MINUTE'


@pytest.mark.asyncio
async def test_unhandled_exception_handler_never_leaks_internals():
    """The catch-all for anything not raised as APIError/HTTPException —
    must never leak the real exception message (could contain internals
    like a stack trace fragment or a raw upstream error body) to the client."""

    exc = RuntimeError('a raw internal secret-bearing traceback line')
    response = await unhandled_exception_handler(None, exc)
    assert response.status_code == 500
    import json
    body = json.loads(response.body)
    assert body == {'code': 'INTERNAL_ERROR', 'message': 'An unexpected error occurred.'}
    assert 'secret' not in response.body.decode()
