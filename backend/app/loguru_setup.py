from __future__ import annotations

import os
import sys

import loguru
from loguru import logger


ENV = os.environ.get('ENV', 'LOCAL').upper()


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

    raw_level = os.environ.get('LOGURU_LEVEL')

    loguru_level = (
        raw_level.upper() if raw_level else ('INFO' if ENV == 'PROD' else 'DEBUG')
    )

    loguru_format = os.environ.get('LOGURU_FORMAT') or (
        '<green>{time:YYYY-MM-DD HH:mm:ss.SSS}</green> | '
        '<level>{level: <8}</level> | <m>[</m>{process}<m>]</m> | '
        '<cyan>{name}</cyan><m>:</m><cyan>{function}</cyan><m>:</m><cyan>{line}</cyan> - '
        '<level>{message}</level>'
    )

    logger.add(sink=sys.stderr, format=loguru_format, level=loguru_level)

    def handle_exception(exc_type, exc_value, exc_traceback):
        logger.debug(
            f"HOOK: exc_type={exc_type}, exc_value={exc_value}, trace={exc_traceback}"
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
