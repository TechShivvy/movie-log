"""utils/openai_utils.py — the error-code map every provider call funnels
through. See plan.md's Iteration 12-15 bug inventory: openai.NotFoundError
was never mapped here at all, falling through to a generic 502 —
harmless while Gemini's model healing was unconditional, not harmless
once auto_fallback became opt-in and a caller could hit a stale model
directly. This module's whole point is to guard that regression and its
siblings.
"""

from fastapi import status
from openai import (
    APIConnectionError,
    APITimeoutError,
    AuthenticationError,
    BadRequestError,
    InternalServerError,
    NotFoundError,
    PermissionDeniedError,
    RateLimitError,
)
from utils.openai_utils import OPENAI_ERROR_MAP, is_context_error, openai_error_to_http


def test_not_found_error_maps_to_404_not_a_generic_502():
    """The exact regression this module exists to prevent — see the
    module docstring."""

    assert NotFoundError in OPENAI_ERROR_MAP
    status_code, _ = OPENAI_ERROR_MAP[NotFoundError]
    assert status_code == status.HTTP_404_NOT_FOUND


def test_every_mapped_error_class_produces_the_right_http_status():
    expected = {
        AuthenticationError: status.HTTP_401_UNAUTHORIZED,
        PermissionDeniedError: status.HTTP_403_FORBIDDEN,
        RateLimitError: status.HTTP_429_TOO_MANY_REQUESTS,
        APITimeoutError: status.HTTP_408_REQUEST_TIMEOUT,
        APIConnectionError: status.HTTP_502_BAD_GATEWAY,
        InternalServerError: status.HTTP_502_BAD_GATEWAY,
        BadRequestError: status.HTTP_400_BAD_REQUEST,
        NotFoundError: status.HTTP_404_NOT_FOUND,
    }
    for exc_type, expected_status in expected.items():
        assert OPENAI_ERROR_MAP[exc_type][0] == expected_status, exc_type


def test_error_messages_are_provider_agnostic_not_hardcoded_openai():
    """The other regression this module guards: messages here used to
    say "OpenAI" by name even when the actual call was to OpenRouter —
    a latent inaccuracy before Gemini existed, fixed to generic wording
    ("the LLM provider") once there were three providers sharing this
    map."""

    for _, message in OPENAI_ERROR_MAP.values():
        assert 'OpenAI' not in message


def test_unmapped_exception_type_falls_through_to_a_generic_502(monkeypatch):
    class _SomeOtherOpenAIError(Exception):
        pass

    # openai_error_to_http's fallback path (type(exc) not in the map)
    exc = _SomeOtherOpenAIError('unexpected')
    http_exc = openai_error_to_http(exc)  # type: ignore[arg-type]
    assert http_exc.status_code == 502
    assert http_exc.detail == 'Unexpected error from upstream service.'


def test_is_context_error_true_only_for_context_length_bad_request():
    ctx_exc = BadRequestError(
        message='maximum context length exceeded',
        response=_fake_response(400),
        body=None,
    )
    other_bad_request = BadRequestError(
        message='some other bad request', response=_fake_response(400), body=None,
    )
    assert is_context_error(ctx_exc) is True
    assert is_context_error(other_bad_request) is False
    # A context-length-shaped message on a *different* exception type
    # shouldn't match either — is_context_error checks isinstance
    # BadRequestError specifically, not just message content.
    assert is_context_error(ValueError('maximum context length exceeded')) is False


def _fake_response(status_code: int):
    import httpx

    return httpx.Response(status_code=status_code, request=httpx.Request('POST', 'https://example.com'))
