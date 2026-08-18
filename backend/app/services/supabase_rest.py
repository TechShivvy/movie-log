"""Supabase PostgREST client scoped to the calling user's JWT.

Every request forwards the user's access token, so Supabase Row Level Security
(RLS) is the single source of truth for authorization. The publishable/anon key
is sent as the required ``apikey`` header.
"""

import time
from datetime import datetime, timezone
from typing import Any, Optional

import httpx
from config import settings
from loguru_setup import LOGGER
from utils.errors import APIError

_TABLE = 'movie_logs'
_TIMEOUT = 15.0
# time_of_day is a PostgREST computed column (movie_logs_time_of_day, migration
# 20260813000012) -- a pure function of watched_time, never stored, so every
# select against movie_logs asks for it by name alongside a plain '*' rather
# than needing its own column.
_MOVIE_LOG_SELECT = '*,time_of_day:movie_logs_time_of_day'


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

    LOGGER.error(
        'PostgREST {} failed: status={} body={}',
        operation, response.status_code, response.text[:500],
    )
    if response.status_code == 401:
        raise APIError(401, 'UNAUTHORIZED', 'Authentication token is invalid or expired.')
    if response.status_code == 403:
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
    theatre_id: Optional[str] = None,
    screen_id: Optional[str] = None,
    movie: Optional[str] = None,
    favorites_only: bool = False,
    archived_only: bool = False,
) -> list[dict[str, Any]]:
    params = {
        'select': _MOVIE_LOG_SELECT,
        'user_id': f'eq.{user_id}',
        # Archived logs are "cold storage" — excluded from the caller's own
        # default list, same as they're excluded from everyone else's view
        # entirely, not just hidden from other people. archived_only flips
        # this to show just the archive instead of mixing it into the
        # regular list.
        'is_archived': 'eq.true' if archived_only else 'eq.false',
        'order': order,
        'limit': str(limit),
        'offset': str(offset),
    }
    # All three are optional narrowing filters on top of the caller's own
    # logs — used by the frontend to answer "have I been here before?" /
    # "have I logged this movie before?" for the revisit-prefill suggestion
    # (routers/movie_logs.py), and doubles as a per-venue "my visit
    # history" view. eq (not ilike) throughout: exact match is enough here
    # since callers always pass back a value they already got from another
    # response (a theatre_id/screen_id they resolved, or a movie title they
    # already displayed), never raw free-text search.
    if theatre_id:
        params['theatre_id'] = f'eq.{theatre_id}'
    if screen_id:
        params['screen_id'] = f'eq.{screen_id}'
    if movie:
        params['movie'] = f'eq.{movie}'
    if favorites_only:
        params['favorite_position'] = 'not.is.null'
    response = await _request(
        'GET', f'/{_TABLE}', user_token, 'list_movie_logs', params=params
    )
    return response.json()


async def search_movie_logs(
    user_token: str,
    *,
    query: str,
    theatre_id: Optional[str] = None,
    screen_id: Optional[str] = None,
    favorites_only: bool = False,
    archived_only: bool = False,
    sort: str,
    order: str,
    limit: int,
    offset: int,
) -> list[dict[str, Any]]:
    body = {
        'p_query': query,
        'p_theatre_id': theatre_id,
        'p_screen_id': screen_id,
        'p_favorites_only': favorites_only,
        'p_archived_only': archived_only,
        'p_sort': sort,
        'p_order': order,
        'p_limit': limit,
        'p_offset': offset,
    }
    response = await _request(
        'POST', '/rpc/search_movie_logs', user_token, 'search_movie_logs', json=body
    )
    return response.json()


async def set_favorite(user_token: str, log_id: str, position: int) -> dict[str, Any]:
    # set_favorite_position (RPC) atomically vacates whichever other log
    # currently holds this position for the caller, then assigns it here —
    # both in one function call, no separate "clear the old slot first" step.
    response = await _request(
        'POST', '/rpc/set_favorite_position', user_token, 'set_favorite',
        params={'select': _MOVIE_LOG_SELECT}, json={'p_log_id': log_id, 'p_position': position},
    )
    result = response.json()
    return result[0] if isinstance(result, list) else result


async def delete_favorite(user_token: str, user_id: str, log_id: str) -> bool:
    # Only matches (and reports success for) a log that was actually
    # favorited — same "404 if there was nothing to remove" shape as
    # delete_venue_rating, not a silent no-op on an already-unfavorited log.
    params = {
        'id': f'eq.{log_id}', 'user_id': f'eq.{user_id}',
        'favorite_position': 'not.is.null',
    }
    response = await _request(
        'PATCH', f'/{_TABLE}', user_token, 'delete_favorite',
        params=params, json={'favorite_position': None}, prefer='return=representation',
    )
    return bool(response.json())


async def get_movie_log(
    user_token: str, user_id: str, log_id: str
) -> Optional[dict[str, Any]]:
    params = {
        'select': _MOVIE_LOG_SELECT,
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
        params={'select': _MOVIE_LOG_SELECT},
        json=row,
        prefer='return=representation',
    )
    created = response.json()
    return created[0] if isinstance(created, list) else created


async def update_movie_log(
    user_token: str, user_id: str, log_id: str, patch: dict[str, Any]
) -> Optional[dict[str, Any]]:
    params = {
        'select': _MOVIE_LOG_SELECT, 'id': f'eq.{log_id}', 'user_id': f'eq.{user_id}',
    }
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

async def upsert_venue_rating(user_token: str, row: dict[str, Any]) -> dict[str, Any]:
    response = await _request(
        'POST',
        '/visit_venue_ratings',
        user_token,
        'upsert_venue_rating',
        json=row,
        prefer='resolution=merge-duplicates,return=representation',
    )
    result = response.json()
    return result[0] if isinstance(result, list) else result


async def get_venue_rating(
    user_token: str, user_id: str, log_id: str
) -> Optional[dict[str, Any]]:
    params = {
        'movie_log_id': f'eq.{log_id}',
        'user_id': f'eq.{user_id}',
        'limit': '1',
    }
    response = await _request(
        'GET', '/visit_venue_ratings', user_token, 'get_venue_rating', params=params
    )
    rows = response.json()
    return rows[0] if rows else None


async def delete_venue_rating(user_token: str, user_id: str, log_id: str) -> bool:
    params = {'movie_log_id': f'eq.{log_id}', 'user_id': f'eq.{user_id}'}
    response = await _request(
        'DELETE', '/visit_venue_ratings', user_token, 'delete_venue_rating',
        params=params, prefer='return=representation',
    )
    return bool(response.json())


async def list_movie_log_photos(
    user_token: str, user_id: str, log_id: str
) -> list[dict[str, Any]]:
    params = {
        'movie_log_id': f'eq.{log_id}',
        'user_id': f'eq.{user_id}',
        'order': 'created_at.asc',
    }
    response = await _request(
        'GET', '/movie_log_photos', user_token, 'list_movie_log_photos', params=params
    )
    return response.json()


async def create_movie_log_photo(user_token: str, row: dict[str, Any]) -> dict[str, Any]:
    response = await _request(
        'POST',
        '/movie_log_photos',
        user_token,
        'create_movie_log_photo',
        json=row,
        prefer='return=representation',
    )
    created = response.json()
    return created[0] if isinstance(created, list) else created


async def delete_movie_log_photo(
    user_token: str, user_id: str, log_id: str, photo_id: str
) -> bool:
    params = {
        'id': f'eq.{photo_id}', 'movie_log_id': f'eq.{log_id}', 'user_id': f'eq.{user_id}',
    }
    response = await _request(
        'DELETE', '/movie_log_photos', user_token, 'delete_movie_log_photo',
        params=params, prefer='return=representation',
    )
    return bool(response.json())


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


async def delete_private_movie_logs(user_token: str, user_id: str) -> None:
    """Called once, right before account deletion (routers/auth.py:delete_account).
    Only `private` logs are removed here — `public`/`anonymous` ones are left
    for the auth.users delete itself to null out via the movie_logs_user_id_fkey
    ON DELETE SET NULL (migration 20260813000001), so they keep showing up on
    theatre/screen review pages and counting toward rating stats, just no
    longer attributed to anyone. Uses the caller's own token — the existing
    movie_logs_delete_own RLS policy is enough, no service-role call needed.
    """
    params = {'user_id': f'eq.{user_id}', 'visibility': 'eq.private'}
    await _request(
        'DELETE', f'/{_TABLE}', user_token, 'delete_private_movie_logs', params=params
    )


async def export_movie_logs(user_token: str, user_id: str) -> list[dict[str, Any]]:
    params = {
        'select': _MOVIE_LOG_SELECT,
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
        params={'select': _MOVIE_LOG_SELECT},
        json=rows,
        prefer='return=representation',
    )
    return response.json()


async def _anon_headers(*, prefer: Optional[str] = None) -> dict[str, str]:
    headers = {'apikey': _apikey(), 'Content-Type': 'application/json'}
    if prefer:
        headers['Prefer'] = prefer
    return headers


async def _anon_request(
    method: str, path: str, operation: str,
    *, params: Optional[dict[str, Any]] = None, json: Any = None,
) -> httpx.Response:
    url = f'{_rest_base()}{path}'
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            response = await client.request(
                method, url, headers=await _anon_headers(), params=params, json=json
            )
    except httpx.HTTPError as exc:
        LOGGER.error('PostgREST {} transport error: {}', operation, exc)
        raise APIError(502, 'UPSTREAM_ERROR', 'Database service is unavailable.') from exc
    _raise_for_upstream(response, operation)
    return response


# ── Theatres / screens ──────────────────────────────────────────────────

async def match_theatres(user_token: str, query: str, city: Optional[str]) -> list[dict]:
    body = {'p_query': query, 'p_city': city}
    response = await _request(
        'POST', '/rpc/match_theatres', user_token, 'match_theatres', json=body
    )
    return response.json()


async def match_screens(user_token: str, theatre_id: str, query: str) -> list[dict]:
    body = {'p_theatre_id': theatre_id, 'p_query': query}
    response = await _request(
        'POST', '/rpc/match_screens', user_token, 'match_screens', json=body
    )
    return response.json()


async def find_theatre_by_place_id(user_token: str, place_id: str) -> Optional[dict]:
    params = {'select': '*', 'place_id': f'eq.{place_id}', 'limit': '1'}
    response = await _request(
        'GET', '/theatres', user_token, 'find_theatre_by_place_id', params=params
    )
    rows = response.json()
    return rows[0] if rows else None


async def create_theatre(user_token: str, row: dict[str, Any]) -> dict[str, Any]:
    response = await _request(
        'POST', '/theatres', user_token, 'create_theatre',
        json=row, prefer='return=representation',
    )
    created = response.json()
    return created[0] if isinstance(created, list) else created


async def list_screens(user_token: str, theatre_id: str) -> list[dict]:
    params = {'select': '*', 'theatre_id': f'eq.{theatre_id}'}
    response = await _request('GET', '/screens', user_token, 'list_screens', params=params)
    return response.json()


async def create_screen(user_token: str, row: dict[str, Any]) -> dict[str, Any]:
    response = await _request(
        'POST', '/screens', user_token, 'create_screen',
        json=row, prefer='return=representation',
    )
    created = response.json()
    return created[0] if isinstance(created, list) else created


async def get_theatre_stats(theatre_id: str) -> Optional[dict]:
    params = {'select': '*', 'theatre_id': f'eq.{theatre_id}', 'limit': '1'}
    response = await _anon_request('GET', '/theatre_rating_stats', 'get_theatre_stats', params=params)
    rows = response.json()
    return rows[0] if rows else None


async def get_screen_stats(screen_id: str) -> Optional[dict]:
    params = {'select': '*', 'screen_id': f'eq.{screen_id}', 'limit': '1'}
    response = await _anon_request('GET', '/screen_rating_stats', 'get_screen_stats', params=params)
    rows = response.json()
    return rows[0] if rows else None


async def get_theatre_punctuality_stats(theatre_id: str) -> Optional[dict]:
    params = {'select': '*', 'theatre_id': f'eq.{theatre_id}', 'limit': '1'}
    response = await _anon_request(
        'GET', '/theatre_punctuality_stats', 'get_theatre_punctuality_stats', params=params
    )
    rows = response.json()
    return rows[0] if rows else None


async def get_screen_punctuality_stats(screen_id: str) -> Optional[dict]:
    params = {'select': '*', 'screen_id': f'eq.{screen_id}', 'limit': '1'}
    response = await _anon_request(
        'GET', '/screen_punctuality_stats', 'get_screen_punctuality_stats', params=params
    )
    rows = response.json()
    return rows[0] if rows else None


# ── Venue notes: private, per-user, one per (user, theatre)/(user, screen) ─

async def get_venue_note(
    user_token: str, user_id: str, *, theatre_id: str | None = None, screen_id: str | None = None
) -> Optional[dict]:
    params: dict[str, str] = {'select': '*', 'user_id': f'eq.{user_id}', 'limit': '1'}
    if theatre_id:
        params['theatre_id'] = f'eq.{theatre_id}'
    if screen_id:
        params['screen_id'] = f'eq.{screen_id}'
    response = await _request('GET', '/venue_notes', user_token, 'get_venue_note', params=params)
    rows = response.json()
    return rows[0] if rows else None


async def upsert_venue_note(
    user_token: str,
    user_id: str,
    note: str,
    *,
    theatre_id: str | None = None,
    screen_id: str | None = None,
) -> dict:
    row: dict[str, Any] = {'user_id': user_id, 'note': note}
    # Exactly one of these is ever passed by the router — the other stays
    # unset (null), matching the table's own scope check.
    if theatre_id:
        row['theatre_id'] = theatre_id
        on_conflict = 'user_id,theatre_id'
    else:
        row['screen_id'] = screen_id
        on_conflict = 'user_id,screen_id'
    response = await _request(
        'POST', '/venue_notes', user_token, 'upsert_venue_note',
        json=row,
        prefer='resolution=merge-duplicates,return=representation',
        params={'on_conflict': on_conflict},
    )
    rows = response.json()
    if not rows:
        raise APIError(500, 'INTERNAL_ERROR', 'Venue note upsert returned no row.')
    return rows[0]


async def delete_venue_note(
    user_token: str, user_id: str, *, theatre_id: str | None = None, screen_id: str | None = None
) -> bool:
    params: dict[str, str] = {'user_id': f'eq.{user_id}'}
    if theatre_id:
        params['theatre_id'] = f'eq.{theatre_id}'
    if screen_id:
        params['screen_id'] = f'eq.{screen_id}'
    response = await _request(
        'DELETE', '/venue_notes', user_token, 'delete_venue_note',
        params=params, prefer='return=representation',
    )
    return bool(response.json())


# ── Public profiles ─────────────────────────────────────────────────────

async def _optional_auth_request(
    method: str, path: str, viewer_token: Optional[str], operation: str, *, json: Any = None,
) -> httpx.Response:
    # Both RPCs below read auth.uid() internally (to filter blocked pairs /
    # compute is_blocked) — that only resolves to something meaningful if
    # this request actually carries the caller's JWT, so a present token
    # must go through _request (the user's own token), not _anon_request.
    # No token still works identically to before Phase 4 — auth.uid() is
    # simply null, so every block-comparison inside the RPC never matches
    # (see the migration's own comment on this).
    if viewer_token:
        return await _request(method, path, viewer_token, operation, json=json)
    return await _anon_request(method, path, operation, json=json)


async def search_public_users(query: str, viewer_token: Optional[str] = None) -> list[dict]:
    response = await _optional_auth_request(
        'POST', '/rpc/search_public_users', viewer_token, 'search_public_users',
        json={'p_query': query},
    )
    return response.json()


async def get_public_profile(username: str, viewer_token: Optional[str] = None) -> Optional[dict]:
    # Username-only lookup — always resolves once a username is set
    # (migration 20260811000010). Content (whether `logs` gets populated)
    # is decided by the caller using the `can_view_content` field this
    # returns (Phase 4), not by whether this call succeeds.
    response = await _optional_auth_request(
        'POST', '/rpc/get_public_profile_by_username', viewer_token, 'get_public_profile',
        json={'p_username': username},
    )
    rows = response.json()
    return rows[0] if rows else None


async def list_public_logs_for_user(
    user_id: str, viewer_token: Optional[str] = None
) -> list[dict]:
    # public_movie_log_entries excludes booking_ref/ticket_image_path/seats,
    # and only includes visibility IN ('anonymous', 'public') rows — see
    # migrations 20260710000003 and 20260810000001. Filtering by
    # `user_id=eq.<theirs>` here only ever matches 'public' rows: the view
    # nulls out user_id for 'anonymous' ones specifically so they can never
    # show up attributed to anyone, including on their own writer's profile.
    # anon has no grant on movie_logs itself, only on this view. viewer_token
    # is optional (this stays fully anonymous-callable) but matters for
    # liked_by_caller, which only resolves to something real over the
    # caller's own token.
    params = {
        'select': '*',
        'user_id': f'eq.{user_id}',
        'order': 'watched_date.desc',
    }
    response = await _optional_auth_get(
        '/public_movie_log_entries', viewer_token, 'list_public_logs_for_user', params=params
    )
    return response.json()


async def list_favorite_logs_for_user(
    user_id: str, viewer_token: Optional[str] = None
) -> list[dict]:
    # Same view/user_id-nulling reasoning as list_public_logs_for_user
    # above — a `private` favorite already can't match here (its row is
    # excluded from the view entirely), so no separate visibility check
    # is needed beyond the existing user_id filter.
    params = {
        'select': '*',
        'user_id': f'eq.{user_id}',
        'favorite_position': 'not.is.null',
        'order': 'favorite_position.asc',
    }
    response = await _optional_auth_get(
        '/public_movie_log_entries', viewer_token, 'list_favorite_logs_for_user', params=params
    )
    return response.json()


async def list_theatre_reviews(
    theatre_id: str, *, limit: int, offset: int, viewer_token: Optional[str] = None
) -> list[dict]:
    # Same view as list_public_logs_for_user, but scoped to a theatre
    # instead of a writer — this is where 'anonymous' entries actually
    # surface (they're deliberately excluded from anyone's own profile).
    # viewer_token is optional (this stays fully anonymous-callable) but
    # matters for liked_by_caller — that column reads auth.uid() inside
    # the view, which only resolves to something real over the caller's
    # own token, not the anon key.
    params = {
        'select': '*',
        'theatre_id': f'eq.{theatre_id}',
        'order': 'created_at.desc',
        'limit': str(limit),
        'offset': str(offset),
    }
    response = await _optional_auth_get(
        '/public_movie_log_entries', viewer_token, 'list_theatre_reviews', params=params
    )
    return response.json()


async def list_screen_reviews(
    screen_id: str, *, limit: int, offset: int, viewer_token: Optional[str] = None
) -> list[dict]:
    params = {
        'select': '*',
        'screen_id': f'eq.{screen_id}',
        'order': 'created_at.desc',
        'limit': str(limit),
        'offset': str(offset),
    }
    response = await _optional_auth_get(
        '/public_movie_log_entries', viewer_token, 'list_screen_reviews', params=params
    )
    return response.json()


async def update_username(user_token: str, user_id: str, username: str) -> dict:
    row = {'user_id': user_id, 'username': username}
    response = await _request(
        'POST', '/user_settings', user_token, 'update_username',
        json=row,
        prefer='resolution=merge-duplicates,return=representation',
        params={'on_conflict': 'user_id'},
    )
    rows = response.json()
    if not rows:
        raise APIError(500, 'INTERNAL_ERROR', 'Username update returned no row.')
    return rows[0]

async def update_account_privacy(user_token: str, user_id: str, account_visibility: str) -> dict:
    row = {'user_id': user_id, 'account_visibility': account_visibility}
    response = await _request(
        'POST', '/user_settings', user_token, 'update_account_privacy',
        json=row,
        prefer='resolution=merge-duplicates,return=representation',
        params={'on_conflict': 'user_id'},
    )
    rows = response.json()
    return rows[0] if rows else {}


async def update_profile(user_token: str, user_id: str, patch: dict) -> dict:
    # Generalizes the single-field upsert shape above to multiple optional
    # columns at once — safe the same way: PostgREST's merge-duplicates
    # upsert only ever touches columns present in the JSON body, and every
    # NOT NULL column on user_settings besides user_id has a default, so an
    # INSERT branch (first-time caller) is safe too.
    row = {'user_id': user_id, **patch}
    response = await _request(
        'POST', '/user_settings', user_token, 'update_profile',
        json=row,
        prefer='resolution=merge-duplicates,return=representation',
        params={'on_conflict': 'user_id'},
    )
    rows = response.json()
    if not rows:
        raise APIError(500, 'INTERNAL_ERROR', 'Profile update returned no row.')
    return rows[0]


async def update_revisit_prefill(user_token: str, user_id: str, prefill_repeat_visit: bool) -> dict:
    row = {'user_id': user_id, 'prefill_repeat_visit': prefill_repeat_visit}
    response = await _request(
        'POST', '/user_settings', user_token, 'update_revisit_prefill',
        json=row,
        prefer='resolution=merge-duplicates,return=representation',
        params={'on_conflict': 'user_id'},
    )
    rows = response.json()
    return rows[0] if rows else {}


async def update_auto_insert_preference(
    user_token: str, user_id: str, auto_insert_extractions: bool
) -> dict:
    row = {'user_id': user_id, 'auto_insert_extractions': auto_insert_extractions}
    response = await _request(
        'POST', '/user_settings', user_token, 'update_auto_insert_preference',
        json=row,
        prefer='resolution=merge-duplicates,return=representation',
        params={'on_conflict': 'user_id'},
    )
    rows = response.json()
    return rows[0] if rows else {}


async def update_llm_preference(
    user_token: str, user_id: str, provider: str, model: str
) -> dict:
    row = {'user_id': user_id, 'preferred_provider': provider, 'preferred_model': model}
    response = await _request(
        'POST', '/user_settings', user_token, 'update_llm_preference',
        json=row,
        prefer='resolution=merge-duplicates,return=representation',
        params={'on_conflict': 'user_id'},
    )
    rows = response.json()
    return rows[0] if rows else {}


async def update_llm_key_storage_opt_in(
    user_token: str, user_id: str, store_on_server: bool
) -> dict:
    row = {'user_id': user_id, 'llm_keys_storage_opt_in': store_on_server}
    response = await _request(
        'POST', '/user_settings', user_token, 'update_llm_key_storage_opt_in',
        json=row,
        prefer='resolution=merge-duplicates,return=representation',
        params={'on_conflict': 'user_id'},
    )
    rows = response.json()
    return rows[0] if rows else {}


# ── Reports ──────────────────────────────────────────────────────────────
# Existence/visibility checks below all use the anon key deliberately, even
# though they're called from an authenticated route — they're answering
# "is this reportable by anyone", the same public-visibility question a
# signed-out caller would get, not "can *this* user see it". A reporter
# shouldn't be able to find out something exists (e.g. a private log) just
# by trying to report it.

async def get_theatre(theatre_id: str) -> Optional[dict]:
    params = {'select': '*', 'id': f'eq.{theatre_id}', 'limit': '1'}
    response = await _anon_request('GET', '/theatres', 'get_theatre', params=params)
    rows = response.json()
    return rows[0] if rows else None


async def get_screen(screen_id: str) -> Optional[dict]:
    params = {'select': '*', 'id': f'eq.{screen_id}', 'limit': '1'}
    response = await _anon_request('GET', '/screens', 'get_screen', params=params)
    rows = response.json()
    return rows[0] if rows else None


async def is_movie_log_reportable(movie_log_id: str) -> bool:
    params = {'select': 'id', 'id': f'eq.{movie_log_id}', 'limit': '1'}
    response = await _anon_request(
        'GET', '/public_movie_log_entries', 'is_movie_log_reportable', params=params
    )
    return bool(response.json())


async def get_like_count(movie_log_id: str) -> int:
    # Liking someone else's log is the common case — get_movie_log is
    # scoped to the caller's *own* rows (user_id = caller), wrong tool
    # here. This reads through the same public view liking itself already
    # required the log to appear in, regardless of whose log it is.
    params = {'select': 'like_count', 'id': f'eq.{movie_log_id}', 'limit': '1'}
    response = await _anon_request(
        'GET', '/public_movie_log_entries', 'get_like_count', params=params
    )
    rows = response.json()
    return rows[0]['like_count'] if rows else 0


async def is_profile_reportable(user_id: str) -> bool:
    # "Reportable" tracks "does a public-facing profile page exist for this
    # user" (has a username) — the profile shell (username/display_name/bio)
    # is visible to anyone who lands on GET /users/{username} regardless of
    # account_visibility, so an abusive bio is reportable even on a private
    # account (migration 20260811000010).
    params = {
        'select': 'user_id',
        'user_id': f'eq.{user_id}',
        'username': 'not.is.null',
        'limit': '1',
    }
    response = await _anon_request(
        'GET', '/user_settings', 'is_profile_reportable', params=params
    )
    return bool(response.json())


async def upsert_report(user_token: str, row: dict[str, Any]) -> dict:
    response = await _request(
        'POST', '/reports', user_token, 'upsert_report',
        json=row,
        prefer='resolution=merge-duplicates,return=representation',
        params={'on_conflict': 'reporter_user_id,target_type,target_id'},
    )
    rows = response.json()
    if not rows:
        raise APIError(500, 'INTERNAL_ERROR', 'Report upsert returned no row.')
    return rows[0]


# ── Follows ──────────────────────────────────────────────────────────────

async def get_follow(user_token: str, follower_id: str, followee_id: str) -> Optional[dict]:
    params = {
        'select': '*',
        'follower_id': f'eq.{follower_id}',
        'followee_id': f'eq.{followee_id}',
        'limit': '1',
    }
    response = await _request('GET', '/follows', user_token, 'get_follow', params=params)
    rows = response.json()
    return rows[0] if rows else None


async def create_follow(user_token: str, follower_id: str, followee_id: str, status: str) -> dict:
    # Plain insert, not an upsert — a repeat follow attempt should surface
    # as ALREADY_FOLLOWING (checked by the router via get_follow before
    # this is ever called), not silently overwrite an existing row.
    row = {'follower_id': follower_id, 'followee_id': followee_id, 'status': status}
    response = await _request(
        'POST', '/follows', user_token, 'create_follow',
        json=row, prefer='return=representation',
    )
    rows = response.json()
    if not rows:
        raise APIError(500, 'INTERNAL_ERROR', 'Follow insert returned no row.')
    return rows[0]


async def delete_follow(user_token: str, follower_id: str, followee_id: str) -> bool:
    params = {'follower_id': f'eq.{follower_id}', 'followee_id': f'eq.{followee_id}'}
    response = await _request(
        'DELETE', '/follows', user_token, 'delete_follow',
        params=params, prefer='return=representation',
    )
    return bool(response.json())


async def accept_follow(user_token: str, follower_id: str, followee_id: str) -> Optional[dict]:
    # Filtered on status=eq.pending so this can only ever transition a
    # pending request forward, never re-affirm an already-accepted one or
    # touch a row that doesn't exist — RLS already restricts *who* can
    # update (followee only), this restricts *which* transition.
    params = {
        'follower_id': f'eq.{follower_id}',
        'followee_id': f'eq.{followee_id}',
        'status': 'eq.pending',
    }
    response = await _request(
        'PATCH', '/follows', user_token, 'accept_follow',
        params=params, json={'status': 'accepted'}, prefer='return=representation',
    )
    rows = response.json()
    return rows[0] if rows else None


async def delete_follower(user_token: str, follower_id: str, followee_id: str) -> bool:
    # Same delete as delete_follow, different party initiating it — covers
    # both "remove an accepted follower" and "reject a pending request".
    params = {'follower_id': f'eq.{follower_id}', 'followee_id': f'eq.{followee_id}'}
    response = await _request(
        'DELETE', '/follows', user_token, 'delete_follower',
        params=params, prefer='return=representation',
    )
    return bool(response.json())


async def list_follow_requests(
    user_token: str, followee_id: str, *, limit: int, offset: int
) -> list[dict]:
    params = {
        'select': '*',
        'followee_id': f'eq.{followee_id}',
        'status': 'eq.pending',
        'order': 'created_at.desc',
        'limit': str(limit),
        'offset': str(offset),
    }
    response = await _request(
        'GET', '/follows', user_token, 'list_follow_requests', params=params
    )
    return response.json()


async def list_followers(
    username: str, *, limit: int, offset: int, viewer_token: Optional[str] = None
) -> list[dict]:
    # Gated by can_view_user_content inside the RPC itself (returns empty
    # for an outsider on a followers_only/private account) — the router
    # still 404s first via _resolve_user if the caller is blocked, same as
    # the profile route, since that check is about existence/visibility of
    # the account at all, not just its content.
    response = await _optional_auth_request(
        'POST', '/rpc/list_followers', viewer_token, 'list_followers',
        json={'p_username': username, 'p_limit': limit, 'p_offset': offset},
    )
    return response.json()


async def list_following(
    username: str, *, limit: int, offset: int, viewer_token: Optional[str] = None
) -> list[dict]:
    response = await _optional_auth_request(
        'POST', '/rpc/list_following', viewer_token, 'list_following',
        json={'p_username': username, 'p_limit': limit, 'p_offset': offset},
    )
    return response.json()


# ── Blocks ───────────────────────────────────────────────────────────────

async def is_blocking(user_token: str, blocker_id: str, blocked_id: str) -> bool:
    # Only ever answers "have I blocked them" — blocks RLS only lets the
    # blocker read their own rows, so "have they blocked me" is
    # structurally unreadable this way (by design, see migration
    # 20260811000012's header comment). That direction is enforced by the
    # DB trigger on the follows insert instead (see create_follow's
    # caller in routers/follows.py).
    params = {
        'select': 'blocker_id',
        'blocker_id': f'eq.{blocker_id}',
        'blocked_id': f'eq.{blocked_id}',
        'limit': '1',
    }
    response = await _request('GET', '/blocks', user_token, 'is_blocking', params=params)
    return bool(response.json())


async def create_block(user_token: str, blocker_id: str, blocked_id: str) -> dict:
    row = {'blocker_id': blocker_id, 'blocked_id': blocked_id}
    response = await _request(
        'POST', '/blocks', user_token, 'create_block',
        json=row, prefer='return=representation',
    )
    rows = response.json()
    if not rows:
        raise APIError(500, 'INTERNAL_ERROR', 'Block insert returned no row.')
    return rows[0]


async def delete_block(user_token: str, blocker_id: str, blocked_id: str) -> bool:
    params = {'blocker_id': f'eq.{blocker_id}', 'blocked_id': f'eq.{blocked_id}'}
    response = await _request(
        'DELETE', '/blocks', user_token, 'delete_block',
        params=params, prefer='return=representation',
    )
    return bool(response.json())


# ── Feed ─────────────────────────────────────────────────────────────────

async def list_feed(user_token: str, *, limit: int, offset: int) -> list[dict]:
    # feed_entries (migration 20260811000013) already does the real
    # filtering (visibility='public', can_view_user_content, excludes the
    # caller's own logs) via auth.uid() read from the caller's own JWT —
    # this has to go through the user's own token, not the anon key, since
    # feed_entries isn't granted to anon at all (the feed requires real
    # sign-in).
    params = {
        'select': '*',
        'order': 'watched_date.desc,created_at.desc',
        'limit': str(limit),
        'offset': str(offset),
    }
    response = await _request('GET', '/feed_entries', user_token, 'list_feed', params=params)
    return response.json()


# ── Notifications ────────────────────────────────────────────────────────

async def list_notifications(
    user_token: str, *, unread_only: bool, limit: int, offset: int
) -> list[dict]:
    # Reads through notifications_view (actor username/avatar + a content
    # preview joined in), not the bare notifications table — the writes
    # below stay on the base table since the view isn't updatable
    # (multiple joins).
    params: dict[str, Any] = {
        'select': '*',
        'order': 'created_at.desc',
        'limit': str(limit),
        'offset': str(offset),
    }
    if unread_only:
        params['read'] = 'eq.false'
    response = await _request(
        'GET', '/notifications_view', user_token, 'list_notifications', params=params
    )
    return response.json()


async def mark_notification_read(user_token: str, notification_id: str) -> Optional[dict]:
    params = {'id': f'eq.{notification_id}'}
    response = await _request(
        'PATCH', '/notifications', user_token, 'mark_notification_read',
        params=params, json={'read': True}, prefer='return=representation',
    )
    rows = response.json()
    return rows[0] if rows else None


async def mark_all_notifications_read(user_token: str) -> int:
    params = {'read': 'eq.false'}
    response = await _request(
        'PATCH', '/notifications', user_token, 'mark_all_notifications_read',
        params=params, json={'read': True}, prefer='return=representation',
    )
    return len(response.json())


# ── Movies catalog ───────────────────────────────────────────────────────

async def find_movie_by_tmdb_id(user_token: str, tmdb_id: int) -> Optional[dict]:
    params = {'select': '*', 'tmdb_id': f'eq.{tmdb_id}', 'limit': '1'}
    response = await _request(
        'GET', '/movies', user_token, 'find_movie_by_tmdb_id', params=params
    )
    rows = response.json()
    return rows[0] if rows else None


async def create_movie(user_token: str, row: dict[str, Any]) -> dict[str, Any]:
    response = await _request(
        'POST', '/movies', user_token, 'create_movie',
        json=row, prefer='return=representation',
    )
    created = response.json()
    return created[0] if isinstance(created, list) else created


async def get_movie(movie_id: str) -> Optional[dict]:
    params = {'select': '*', 'id': f'eq.{movie_id}', 'limit': '1'}
    response = await _anon_request('GET', '/movies', 'get_movie', params=params)
    rows = response.json()
    return rows[0] if rows else None


async def get_movie_stats(movie_id: str) -> Optional[dict]:
    params = {'select': '*', 'movie_id': f'eq.{movie_id}', 'limit': '1'}
    response = await _anon_request(
        'GET', '/movie_rating_stats', 'get_movie_stats', params=params
    )
    rows = response.json()
    return rows[0] if rows else None


async def list_movie_reviews(
    movie_id: str, *, limit: int, offset: int, viewer_token: Optional[str] = None
) -> list[dict]:
    # Same public_movie_log_entries view theatre/screen reviews already use
    # (visibility in ('anonymous', 'public') only) — see list_theatre_reviews.
    params = {
        'select': '*',
        'movie_id': f'eq.{movie_id}',
        'order': 'created_at.desc',
        'limit': str(limit),
        'offset': str(offset),
    }
    response = await _optional_auth_get(
        '/public_movie_log_entries', viewer_token, 'list_movie_reviews', params=params
    )
    return response.json()


# ── Account export/import ───────────────────────────────────────────────

async def get_own_settings(user_token: str, user_id: str) -> dict[str, Any]:
    params = {'select': '*', 'user_id': f'eq.{user_id}', 'limit': '1'}
    response = await _request('GET', '/user_settings', user_token, 'get_own_settings', params=params)
    rows = response.json()
    # No row yet (never touched any profile/username/privacy endpoint) is a
    # real, common state, not an error — same defaults ProfileExport itself
    # falls back to.
    return rows[0] if rows else {}


async def export_movie_logs_with_ratings(user_token: str, user_id: str) -> list[dict[str, Any]]:
    # PostgREST resource embedding via the FK it already detects
    # (visit_venue_ratings.movie_log_id -> movie_logs.id) -- one request
    # instead of fetching logs and ratings separately and joining in
    # Python. A log with no rating gets an empty array back, not null.
    params = {
        'select': f'{_MOVIE_LOG_SELECT},venue_rating:visit_venue_ratings(screen_rating,speaker_rating,ac_rating,seat_rating)',
        'user_id': f'eq.{user_id}',
        'order': 'created_at.desc',
    }
    response = await _request(
        'GET', f'/{_TABLE}', user_token, 'export_movie_logs_with_ratings', params=params
    )
    # visit_venue_ratings.movie_log_id is that table's own primary key (one
    # rating per log, at most) -- PostgREST detects this as a to-one
    # relationship and embeds a single object (or null), not a list.
    return response.json()


async def export_venue_notes(user_token: str, user_id: str) -> list[dict[str, Any]]:
    params = {'select': '*', 'user_id': f'eq.{user_id}'}
    response = await _request(
        'GET', '/venue_notes', user_token, 'export_venue_notes', params=params
    )
    return response.json()


# ── Comments ─────────────────────────────────────────────────────────────

async def _optional_auth_get(
    path: str, viewer_token: Optional[str], operation: str, *, params: dict[str, Any]
) -> httpx.Response:
    # movie_log_comments_view reads auth.uid() itself (to allow the log's own
    # owner to see comments regardless of visibility) — only meaningful with
    # the caller's real token; no token still works, auth.uid() is simply
    # null, same "no token = anonymous, not a special case" shape used
    # everywhere else optional auth appears in this file.
    if viewer_token:
        return await _request('GET', path, viewer_token, operation, params=params)
    return await _anon_request('GET', path, operation, params=params)


async def list_comments(
    viewer_token: Optional[str], movie_log_id: str, *, limit: int, offset: int
) -> list[dict[str, Any]]:
    top_level_params = {
        'select': '*',
        'movie_log_id': f'eq.{movie_log_id}',
        'parent_comment_id': 'is.null',
        'order': 'created_at.asc',
        'limit': str(limit),
        'offset': str(offset),
    }
    response = await _optional_auth_get(
        '/movie_log_comments_view', viewer_token, 'list_comments', params=top_level_params
    )
    top_level = response.json()
    for comment in top_level:
        comment['replies'] = []
    if not top_level:
        return top_level

    # One extra query for every reply to this page's top-level comments —
    # not paginated separately, this is deliberately shallow (one level),
    # so a "load more replies" call isn't needed the way it would be for
    # real threading.
    ids = ','.join(c['id'] for c in top_level)
    reply_params = {
        'select': '*',
        'parent_comment_id': f'in.({ids})',
        'order': 'created_at.asc',
    }
    reply_response = await _optional_auth_get(
        '/movie_log_comments_view', viewer_token, 'list_comment_replies', params=reply_params
    )
    by_parent: dict[str, list[dict[str, Any]]] = {}
    for reply in reply_response.json():
        by_parent.setdefault(reply['parent_comment_id'], []).append(reply)
    for comment in top_level:
        comment['replies'] = by_parent.get(comment['id'], [])
    return top_level


async def create_comment(user_token: str, row: dict[str, Any]) -> dict[str, Any]:
    response = await _request(
        'POST', '/movie_log_comments', user_token, 'create_comment',
        json=row, prefer='return=representation',
    )
    created = response.json()
    return created[0] if isinstance(created, list) else created


async def update_comment(
    user_token: str, user_id: str, comment_id: str, text: str
) -> Optional[dict[str, Any]]:
    params = {'id': f'eq.{comment_id}', 'user_id': f'eq.{user_id}', 'deleted_at': 'is.null'}
    response = await _request(
        'PATCH', '/movie_log_comments', user_token, 'update_comment',
        params=params, json={'text': text}, prefer='return=representation',
    )
    rows = response.json()
    return rows[0] if rows else None


async def delete_comment(
    user_token: str, user_id: str, comment_id: str
) -> Optional[dict[str, Any]]:
    # Always a soft delete — clears text, sets deleted_at — never a real
    # DELETE, regardless of whether this comment has replies: one code
    # path, not a conditional hard/soft split. deleted_at: is.null in the
    # filter makes this idempotent-safe (a second delete finds no matching
    # row rather than re-clearing an already-cleared comment) and lets the
    # caller distinguish "not found" from "already deleted" the same way.
    params = {'id': f'eq.{comment_id}', 'user_id': f'eq.{user_id}', 'deleted_at': 'is.null'}
    response = await _request(
        'PATCH', '/movie_log_comments', user_token, 'delete_comment',
        params=params,
        json={'text': None, 'deleted_at': datetime.now(timezone.utc).isoformat()},
        prefer='return=representation',
    )
    rows = response.json()
    return rows[0] if rows else None


# ── Likes ────────────────────────────────────────────────────────────────
# A single reaction, not a vote — no dislike/downvote exists anywhere in
# this API. Both tables use the same (target_id, user_id) primary key
# shape, so inserting twice is a clean conflict, not a double-count.

async def like_movie_log(user_token: str, movie_log_id: str, user_id: str) -> int:
    await _request(
        'POST', '/movie_log_likes', user_token, 'like_movie_log',
        json={'movie_log_id': movie_log_id, 'user_id': user_id},
    )
    return await get_like_count(movie_log_id)


async def unlike_movie_log(user_token: str, movie_log_id: str, user_id: str) -> bool:
    params = {'movie_log_id': f'eq.{movie_log_id}', 'user_id': f'eq.{user_id}'}
    response = await _request(
        'DELETE', '/movie_log_likes', user_token, 'unlike_movie_log',
        params=params, prefer='return=representation',
    )
    return bool(response.json())


async def like_comment(user_token: str, comment_id: str, user_id: str) -> dict[str, Any]:
    await _request(
        'POST', '/comment_likes', user_token, 'like_comment',
        json={'comment_id': comment_id, 'user_id': user_id},
    )
    params = {'select': '*', 'id': f'eq.{comment_id}', 'limit': '1'}
    response = await _request(
        'GET', '/movie_log_comments', user_token, 'get_comment_after_like', params=params
    )
    rows = response.json()
    return rows[0] if rows else {}


async def unlike_comment(user_token: str, comment_id: str, user_id: str) -> bool:
    params = {'comment_id': f'eq.{comment_id}', 'user_id': f'eq.{user_id}'}
    response = await _request(
        'DELETE', '/comment_likes', user_token, 'unlike_comment',
        params=params, prefer='return=representation',
    )
    return bool(response.json())


async def get_comment_like_count(user_token: str, comment_id: str) -> Optional[int]:
    # None (not 0) when the comment doesn't exist or isn't visible to the
    # caller — lets like_comment/unlike_comment tell "nothing to count"
    # apart from "genuinely not found", instead of collapsing both to 0.
    params = {'select': 'like_count', 'id': f'eq.{comment_id}', 'limit': '1'}
    response = await _request(
        'GET', '/movie_log_comments', user_token, 'get_comment_like_count', params=params
    )
    rows = response.json()
    return rows[0]['like_count'] if rows else None

async def get_extraction_batch(user_token: str, user_id: str, batch_id: str) -> Optional[dict[str, Any]]:
    """RLS-scoped read (extraction_batches_select_own) — writes to this
    table are service-role-only (services/extraction_batches.py), this
    is the one place a caller reads their own batch's status back."""

    params = {'select': '*', 'id': f'eq.{batch_id}', 'user_id': f'eq.{user_id}', 'limit': '1'}
    response = await _request(
        'GET', '/extraction_batches', user_token, 'get_extraction_batch', params=params
    )
    rows = response.json()
    return rows[0] if rows else None


async def list_extraction_batches(
    user_token: str, user_id: str, *, limit: int, offset: int
) -> list[dict[str, Any]]:
    params = {
        'select': '*', 'user_id': f'eq.{user_id}',
        'order': 'created_at.desc', 'limit': str(limit), 'offset': str(offset),
    }
    response = await _request(
        'GET', '/extraction_batches', user_token, 'list_extraction_batches', params=params
    )
    return response.json()


async def list_extraction_batch_items(user_token: str, batch_id: str) -> list[dict[str, Any]]:
    # No user_id filter needed here — extraction_batch_items_select_own
    # (RLS) already scopes this to batches the caller owns via a join
    # back to extraction_batches, same as get_extraction_batch above
    # gates the batch row itself.
    params = {'select': '*', 'batch_id': f'eq.{batch_id}', 'order': 'position.asc'}
    response = await _request(
        'GET', '/extraction_batch_items', user_token, 'list_extraction_batch_items', params=params
    )
    return response.json()
