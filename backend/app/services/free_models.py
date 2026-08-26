"""Dynamic free-model catalog, fetched from the GitHub Actions-published
snapshot (.github/workflows/refresh-free-models.yml, on a separate
branch pending PR into main) instead of relying solely on the hand-
maintained `free_models` list in config.yaml, which goes stale as
OpenRouter adds and drops free models over time.

Fetched lazily on access with a TTL, not on a background thread/timer.
`/extract` is called often enough in practice that "check staleness on
access, refetch if needed" keeps the cache warm on its own — a
background thread would only help the very first request after a long
idle period, at the cost of real complexity (thread lifecycle, its
interaction with the asyncio loop, orphaned timers across reloads) that
buys nothing here. Same pattern as llm/llm_client.py's
_all_models() cache.

Fallback chain, each layer only used if the one before it is unavailable:
  1. The dynamically-fetched snapshot (raw.githubusercontent.com), or a
     stale cached copy of it if today's fetch failed but a previous one
     succeeded — a slightly stale real list still beats a hand-
     maintained one that's guaranteed to go stale eventually anyway.
  2. config.yaml's static `free_models` / `default_free_model` — kept
     deliberately, not removed, as the safety net for "the snapshot
     branch doesn't exist yet / raw URL is unreachable / this deploy
     has no egress to github.com".
  3. `openrouter/free`, OpenRouter's own free-tier router. Verified live
     (2026-08-11) at pricing 0/0 with input_modalities ["text","image"],
     so it's a genuine zero-cost, image-capable model that OpenRouter
     itself keeps current server-side — the right emergency floor,
     unlike `openrouter/auto` (pricing "-1"/"-1", resolved per-request
     against whatever underlying model gets picked, not guaranteed free
     at all despite listing image support).
"""

import time
from typing import Any, Optional

import httpx
from config import settings
from loguru_setup import LOGGER

_SNAPSHOT_URL = (
    'https://raw.githubusercontent.com/TechShivvy/movie-log/'
    'data/free-models/free-models.json'
)
_TIMEOUT = 10.0
_CACHE_TTL = 3600.0  # 1 hour, matches llm/llm_client.py's model cache

HARD_FALLBACK_MODEL = 'openrouter/free'

_cache: dict[str, Any] = {'fetched_at': 0.0, 'models': None}


async def _fetch_snapshot() -> Optional[list[dict[str, Any]]]:
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            response = await client.get(_SNAPSHOT_URL)
        response.raise_for_status()
        models = response.json().get('models')
        if not isinstance(models, list) or not models:
            raise ValueError('snapshot has no models')
        return models
    except (httpx.HTTPError, ValueError) as exc:
        LOGGER.warning('free_models: snapshot fetch failed: {}', exc)
        return None


async def _get_snapshot_models() -> Optional[list[dict[str, Any]]]:
    """The dynamically-fetched free-model list, or None if it (and any
    previously cached copy of it) is entirely unavailable — callers fall
    back to config.yaml in that case."""

    now = time.monotonic()
    if _cache['models'] is not None and now - _cache['fetched_at'] < _CACHE_TTL:
        return _cache['models']

    models = await _fetch_snapshot()
    if models is not None:
        _cache['models'] = models
        _cache['fetched_at'] = now
        return models

    if _cache['models'] is not None:
        LOGGER.warning('free_models: serving stale cached snapshot after fetch failure')
        return _cache['models']

    return None


async def is_free_model(model_name: str) -> bool:
    """Whether model_name is a genuinely free OpenRouter model, per the
    dynamically-fetched snapshot where available."""

    models = await _get_snapshot_models()
    if models is not None:
        return model_name in {m['id'] for m in models}

    if settings.free_models and model_name in settings.free_models:
        return True

    # Last resort, only reached if the snapshot has never once succeeded
    # and static config didn't already match: OpenRouter's own naming
    # convention. Not guaranteed by OpenRouter, but better than nothing.
    return model_name.endswith(':free')


async def default_free_model(requires_image: bool = True) -> str:
    """A free model suitable as the default for the caller's request.

    requires_image=True (the /extract default, an image upload) narrows
    to image-capable models first — no point handing back a text-only
    model that would just fail on the very first real request.
    requires_image=False (/extract-from-link, plain scraped text — see
    llm/llm_client.py's extract_movie_metadata_from_text) doesn't
    filter by modality at all, since restricting to image-capable models
    there would only needlessly shrink the pool for no reason — a
    text-only free model (e.g. cohere/north-mini-code:free) works just
    as well as an image-capable one when there's no image involved.
    """

    models = await _get_snapshot_models()
    if models is not None:
        if requires_image:
            pool = [m['id'] for m in models if 'image' in (m.get('input_modalities') or [])] or [
                m['id'] for m in models
            ]
        else:
            pool = [m['id'] for m in models]
        if settings.default_free_model in pool:
            return settings.default_free_model
        if pool:
            return pool[0]

    if settings.default_free_model:
        return settings.default_free_model

    return HARD_FALLBACK_MODEL
