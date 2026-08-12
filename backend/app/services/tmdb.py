"""TMDB (themoviedb.org) API v3 client — movie search/autocomplete, movie
details, upcoming releases.

Optional end-to-end, same shape as google_places.py: every function here
only runs when settings.tmdb_api_key is configured; callers fall back to a
free-typed movie title (movie_logs.movie_id left null) when it isn't.
Chosen over Letterboxd (no public API, invite-only) and OMDb (thinner,
English-skewed, much lower free-tier limit) — TMDB has strong multi-
language coverage (including Indian regional cinema) and a generous free
rate limit (~50 req/s), with dedicated search/upcoming endpoints so new
releases stay current without this app maintaining anything itself.
"""

from typing import Any, Optional

import httpx
from config import settings
from loguru_setup import LOGGER
from utils.errors import APIError

_BASE = 'https://api.themoviedb.org/3'
_TIMEOUT = 10.0


def is_configured() -> bool:
    return bool(settings.tmdb_api_key)


def _api_key() -> str:
    if not settings.tmdb_api_key:
        raise APIError(500, 'CONFIG_ERROR', 'TMDB API key is not configured on the backend.')
    return settings.tmdb_api_key.get_secret_value()


def _shape(item: dict[str, Any]) -> dict[str, Any]:
    return {
        'tmdb_id': item.get('id'),
        'title': item.get('title') or item.get('name'),
        'original_language': item.get('original_language'),
        'release_date': item.get('release_date') or None,
        'poster_path': item.get('poster_path'),
    }


async def _get(path: str, params: dict[str, Any]) -> dict[str, Any]:
    params = {**params, 'api_key': _api_key()}
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            response = await client.get(f'{_BASE}{path}', params=params)
    except httpx.HTTPError as exc:
        LOGGER.error('TMDB {} transport error: {}', path, exc)
        raise APIError(502, 'UPSTREAM_ERROR', 'TMDB is unavailable.') from exc

    if response.status_code == 404:
        raise APIError(404, 'NOT_FOUND', 'No TMDB result for this id.')
    if response.status_code != 200:
        LOGGER.error('TMDB {} failed status={} body={}', path, response.status_code, response.text[:500])
        raise APIError(502, 'UPSTREAM_ERROR', 'TMDB request failed.')
    return response.json()


async def search_movies(query: str) -> list[dict[str, Any]]:
    data = await _get('/search/movie', {'query': query, 'include_adult': 'false'})
    return [_shape(item) for item in data.get('results', [])]


async def movie_details(tmdb_id: int) -> dict[str, Any]:
    data = await _get(f'/movie/{tmdb_id}', {})
    return _shape(data)


async def upcoming_movies(*, region: Optional[str], language: Optional[str]) -> list[dict[str, Any]]:
    params: dict[str, Any] = {}
    if region:
        params['region'] = region
    if language:
        params['language'] = language
    data = await _get('/movie/upcoming', params)
    return [_shape(item) for item in data.get('results', [])]
