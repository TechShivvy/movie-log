import random

from config import settings
from fastapi import HTTPException, status
from loguru_setup import LOGGER
from utils.image import optimize_image_data_uri


def calculate_backoff(attempt: int) -> float:
    """Calculate the backoff time for retries

    Args:
        attempt (int): The current attempt number

    Returns:
        float: The backoff time in seconds
    """

    base = min(settings.base_delay * (2 ** (attempt - 1)), 60.0)
    jitter = base * 0.1 * (2 * random.random() - 1)
    return base + jitter


def shrink_or_fail(image_data_uri: str, attempt: int, max_attempts: int) -> str:
    """Shrink the image data URI if it exceeds context limits, or raise an error

    Args:
        image_data_uri (str): The data URI of the image to shrink
        attempt (int): The current attempt number
        max_attempts (int): The maximum number of attempts allowed

    Raises:
        HTTPException: If the maximum number of attempts is reached

    Returns:
        str: The shrunk image data URI
    """
    if attempt >= max_attempts:
        LOGGER.error('Context limit exceeded after all attempts')
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail='Image could not be optimized to fit context limits. Try a smaller image.',
        )

    LOGGER.info(f'ContextError: shrinking payload (attempt {attempt})')
    return optimize_image_data_uri(image_data_uri, max_size=600, quality=70)
