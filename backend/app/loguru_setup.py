from __future__ import annotations

import sys

import loguru
from config import settings
from loguru import logger


def setup_logging() -> 'loguru.Logger':
    """
    Configure and initialize the Loguru logger.

    This function removes any existing handlers, sets the logging level and format
    based on environment variables (with sensible defaults), and installs a global
    exception handler that logs uncaught exceptions.

    Returns:
        loguru.Logger: Configured Loguru logger instance.
    """

    logger.remove()

    loguru_level = settings.loguru_level
    loguru_format = settings.loguru_format

    logger.add(sink=sys.stderr, format=loguru_format, level=loguru_level)

    def handle_exception(exc_type, exc_value, exc_traceback):
        logger.debug(
            f'HOOK: exc_type={exc_type}, exc_value={exc_value}, trace={exc_traceback}'
        )
        if issubclass(exc_type, KeyboardInterrupt):
            sys.__excepthook__(exc_type, exc_value, exc_traceback)
            return
        logger.exception(
            'Uncaught exception', exc_info=(exc_type, exc_value, exc_traceback)
        )

    sys.excepthook = handle_exception

    return logger


LOGGER = setup_logging()
