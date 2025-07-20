from openai import (
    APIConnectionError,
    APITimeoutError,
    AuthenticationError,
    BadRequestError,
    InternalServerError,
    OpenAIError,
    PermissionDeniedError,
    RateLimitError,
)
from fastapi import HTTPException, status
from loguru_setup import LOGGER


OPENAI_ERROR_MAP = {
    AuthenticationError: (status.HTTP_401_UNAUTHORIZED, 'Invalid API key.'),
    PermissionDeniedError: (status.HTTP_403_FORBIDDEN, 'Permission denied.'),
    RateLimitError: (
        status.HTTP_429_TOO_MANY_REQUESTS,
        'Too many requests. Please try again later.',
    ),
    APITimeoutError: (status.HTTP_408_REQUEST_TIMEOUT, 'Request to OpenAI timed out.'),
    APIConnectionError: (
        status.HTTP_502_BAD_GATEWAY,
        'Unable to connect to OpenAI. Please retry later.',
    ),
    InternalServerError: (
        status.HTTP_502_BAD_GATEWAY,
        'Upstream service error. Please retry later.',
    ),
    BadRequestError: (
        status.HTTP_400_BAD_REQUEST,
        'Bad request. Please check input format.',
    ),
}


def openai_error_to_http(exc: OpenAIError) -> HTTPException:
    """Convert OpenAIError to HTTPException

    Args:
        exc (OpenAIError): The OpenAIError instance

    Returns:
        HTTPException: The corresponding HTTPException
    """

    status_code, user_message = OPENAI_ERROR_MAP.get(
        type(exc),
        (502, 'Unexpected error from upstream service.'),
    )

    LOGGER.error(f'OpenAI error [{type(exc).__name__}]: {exc}')
    LOGGER.debug(f'Exception details: {exc.__dict__}')
    LOGGER.debug(f'Error details: {str(exc)}')

    return HTTPException(status_code=status_code, detail=user_message)


def is_context_error(exc: Exception) -> bool:
    """Check if the exception is related to context length limits.

    Args:
        exc (Exception): The exception to check.

    Returns:
        bool: True if the exception is a context error, False otherwise.
    """

    msg = str(exc).lower()
    return isinstance(exc, BadRequestError) and (
        'maximum context length' in msg or 'max bytes per data-uri item' in msg
    )
