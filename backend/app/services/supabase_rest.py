"""Supabase PostgREST client scoped to the calling user's JWT.

Every request forwards the user's access token, so Supabase Row Level Security
(RLS) is the single source of truth for authorization. The publishable/anon key
is sent as the required ``apikey`` header.
"""

import time
from typing import Any, Optional

import httpx
from config import settings
from loguru_setup import LOGGER
from utils.errors import APIError

_TABLE = 'movie_logs'
_TIMEOUT = 15.0


def _rest_base() -> str:
    if not settings.supabase_url:
        raise APIError(
            500,
            'CONFIG_ERROR',
            'Supabase URL is not configured on the backend.',
        )
    return f"{settings.supabase_url.rstrip('/')}/rest/v1"


def _apikey() -> str:
    key = (
        settings.supabase_publishable_key.get_secret_value()
        if settings.supabase_publishable_key
        else None
    )
    if not key:
        raise APIError(
            500,
            'CONFIG_ERROR',
            'Supabase publishable key is not configured on the backend. '
            'Set SUPABASE_PUBLISHABLE_KEY.',
        )
    return key


def _headers(user_token: str, *, prefer: Optional[str] = None) -> dict[str, str]:
    headers = {
        'apikey': _apikey(),
        'Authorization': f'Bearer {user_token}',
        'Content-Type': 'application/json',
    }
    if prefer:
        headers['Prefer'] = prefer
    return headers


def _raise_for_upstream(response: httpx.Response, operation: str) -> None:
    if response.status_code < 400:
        return

    # Never surface raw PostgREST internals to the client.
    LOGGER.error(
        'PostgREST {} failed: status={} body={}',
        operation,
        response.status_code,
        response.text[:500],
    )
    if response.status_code in (401, 403):
        raise APIError(403, 'FORBIDDEN', 'You do not have access to this resource.')
    if response.status_code == 404:
        raise APIError(404, 'NOT_FOUND', 'Resource not found.')
    if response.status_code < 500:
        raise APIError(400, 'BAD_REQUEST', 'The request could not be processed.')
    raise APIError(502, 'UPSTREAM_ERROR', 'Database service is unavailable.')


async def _request(
    method: str,
    path: str,
    user_token: str,
    operation: str,
    *,
    params: Optional[dict[str, Any]] = None,
    json: Any = None,
    prefer: Optional[str] = None,
) -> httpx.Response:
    url = f'{_rest_base()}{path}'
    started = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            response = await client.request(
                method,
                url,
                headers=_headers(user_token, prefer=prefer),
                params=params,
                json=json,
            )
    except httpx.HTTPError as exc:
        LOGGER.error('PostgREST {} transport error: {}', operation, exc)
        raise APIError(
            502, 'UPSTREAM_ERROR', 'Database service is unavailable.'
        ) from exc

    duration = time.monotonic() - started
    LOGGER.debug(
        'PostgREST {} status={} duration={:.3f}s',
        operation,
        response.status_code,
        duration,
    )
    _raise_for_upstream(response, operation)
    return response


async def list_movie_logs(
    user_token: str,
    user_id: str,
    *,
    limit: int,
    offset: int,
    order: str,
) -> list[dict[str, Any]]:
    params = {
        'select': '*',
        'user_id': f'eq.{user_id}',
        'order': order,
        'limit': str(limit),
        'offset': str(offset),
    }
    response = await _request(
        'GET', f'/{_TABLE}', user_token, 'list_movie_logs', params=params
    )
    return response.json()


async def get_movie_log(
    user_token: str, user_id: str, log_id: str
) -> Optional[dict[str, Any]]:
    params = {
        'select': '*',
        'id': f'eq.{log_id}',
        'user_id': f'eq.{user_id}',
        'limit': '1',
    }
    response = await _request(
        'GET', f'/{_TABLE}', user_token, 'get_movie_log', params=params
    )
    rows = response.json()
    return rows[0] if rows else None


async def create_movie_log(user_token: str, row: dict[str, Any]) -> dict[str, Any]:
    response = await _request(
        'POST',
        f'/{_TABLE}',
        user_token,
        'create_movie_log',
        json=row,
        prefer='return=representation',
    )
    created = response.json()
    return created[0] if isinstance(created, list) else created


async def update_movie_log(
    user_token: str, user_id: str, log_id: str, patch: dict[str, Any]
) -> Optional[dict[str, Any]]:
    params = {'id': f'eq.{log_id}', 'user_id': f'eq.{user_id}'}
    response = await _request(
        'PATCH',
        f'/{_TABLE}',
        user_token,
        'update_movie_log',
        params=params,
        json=patch,
        prefer='return=representation',
    )
    rows = response.json()
    return rows[0] if rows else None


async def delete_movie_log(user_token: str, user_id: str, log_id: str) -> bool:
    params = {'id': f'eq.{log_id}', 'user_id': f'eq.{user_id}'}
    response = await _request(
        'DELETE',
        f'/{_TABLE}',
        user_token,
        'delete_movie_log',
        params=params,
        prefer='return=representation',
    )
    rows = response.json()
    return bool(rows)


async def export_movie_logs(user_token: str, user_id: str) -> list[dict[str, Any]]:
    params = {
        'select': '*',
        'user_id': f'eq.{user_id}',
        'order': 'created_at.desc',
    }
    response = await _request(
        'GET', f'/{_TABLE}', user_token, 'export_movie_logs', params=params
    )
    return response.json()


async def import_movie_logs(
    user_token: str, rows: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    response = await _request(
        'POST',
        f'/{_TABLE}',
        user_token,
        'import_movie_logs',
        json=rows,
        prefer='return=representation',
    )
    return response.json()
