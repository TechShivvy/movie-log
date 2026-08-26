"""Reusable "how long did this take" decorator, so timing a function is
one line instead of hand-rolled start/finally boilerplate at every call
site (replaces an inline `__import__('time')` timer that only covered
one of several places worth timing — see routers/movie_metadata.py).

Works on both async and sync functions (detected automatically), and
times failures too, not just successful returns — a call that's slow
AND fails is exactly the case you most want the duration for, not one
to silently skip.
"""

import asyncio
import functools
import time
from typing import Callable, Optional, TypeVar

from loguru_setup import LOGGER

F = TypeVar('F', bound=Callable)


def timed(func: Optional[F] = None, *, label: Optional[str] = None) -> Callable:
    """Logs '{label} took {X.XXX}s' when the wrapped function returns or
    raises. Usable bare (`@timed`) or with a custom label
    (`@timed(label="scrape")`) — otherwise defaults to the function's
    own qualified name.
    """

    def decorator(f: F) -> F:
        name = label or f.__qualname__

        if asyncio.iscoroutinefunction(f):

            @functools.wraps(f)
            async def async_wrapper(*args, **kwargs):
                start = time.perf_counter()
                try:
                    return await f(*args, **kwargs)
                finally:
                    LOGGER.info('{} took {:.3f}s', name, time.perf_counter() - start)

            return async_wrapper  # type: ignore[return-value]

        @functools.wraps(f)
        def sync_wrapper(*args, **kwargs):
            start = time.perf_counter()
            try:
                return f(*args, **kwargs)
            finally:
                LOGGER.info('{} took {:.3f}s', name, time.perf_counter() - start)

        return sync_wrapper  # type: ignore[return-value]

    if func is not None:
        # Used bare: @timed
        return decorator(func)
    # Used with args: @timed(...) / @timed(label='...')
    return decorator
