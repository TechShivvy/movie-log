"""Standalone movie-log CRUD + export/import API.

All endpoints require a Supabase access token (Bearer). Data access goes through
PostgREST using that token, so Supabase RLS scopes every operation to the caller.
Server-managed fields (id/user_id/created_at/updated_at) are never taken from the
client, preventing mass-assignment / cross-user writes.
"""

from typing import Annotated, Any, List, Literal

from auth.supabase_auth import AuthenticatedUser, get_current_user
from fastapi import APIRouter, Body, Depends, Query, Request, status
from loguru_setup import LOGGER
from schemas.movie_log import WRITABLE_FIELDS, MovieLog, MovieLogInput, MovieLogUpdate
from schemas.venues import VenueRatingInput
from services import supabase_rest
from utils.errors import APIError

from rate_limit import limiter

router = APIRouter()

_MAX_IMPORT = 500
_SORT_FIELDS = {'created_at', 'updated_at', 'watched_date', 'movie'}


def _uid(user_id: str) -> str:
    """Return a redacted uid safe to log (first 8 chars + ellipsis)."""
    return f'{user_id[:8]}…' if len(user_id) > 8 else user_id


def _enforce_image_prefix(user_id: str, path: str | None) -> None:
    if path and not path.startswith(f'{user_id}/'):
        raise APIError(
            status.HTTP_400_BAD_REQUEST,
            'INVALID_IMAGE_PATH',
            "ticket_image_path must live under the user's own storage prefix.",
        )


def _writable_row(payload: dict[str, Any]) -> dict[str, Any]:
    return {k: payload[k] for k in WRITABLE_FIELDS if k in payload}


@router.get('', response_model=List[MovieLog], tags=['Movie Logs'])
async def list_logs(
    current_user: AuthenticatedUser = Depends(get_current_user),
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    sort: Literal['created_at', 'updated_at', 'watched_date', 'movie'] = 'created_at',
    order: Literal['asc', 'desc'] = 'desc',
) -> Any:
    if sort not in _SORT_FIELDS:
        raise APIError(400, 'BAD_REQUEST', 'Invalid sort field.')
    order_str = f'{sort}.{order}'
    LOGGER.debug(
        'list_logs user={} limit={} offset={} order={}',
        _uid(current_user.user_id),
        limit,
        offset,
        order_str,
    )
    return await supabase_rest.list_movie_logs(
        current_user.access_token,
        current_user.user_id,
        limit=limit,
        offset=offset,
        order=order_str,
    )


@router.post('', response_model=MovieLog, status_code=201, tags=['Movie Logs'])
@limiter.limit('30/minute')
async def create_log(
    request: Request,
    payload: MovieLogInput,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Any:
    row = _writable_row(payload.model_dump())
    _enforce_image_prefix(current_user.user_id, row.get('ticket_image_path'))
    if not row.get('movie'):
        raise APIError(
            status.HTTP_400_BAD_REQUEST,
            'MISSING_MOVIE_TITLE',
            'movie title is required when creating a log.',
        )
    row['user_id'] = current_user.user_id
    LOGGER.info('create_log user={}', _uid(current_user.user_id))
    return await supabase_rest.create_movie_log(current_user.access_token, row)


@router.get('/export', tags=['Movie Logs'])
async def export_logs(
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Any:
    rows = await supabase_rest.export_movie_logs(
        current_user.access_token, current_user.user_id
    )
    LOGGER.info('export_logs user={} count={}', _uid(current_user.user_id), len(rows))
    return {'count': len(rows), 'items': rows}


@router.post('/import', tags=['Movie Logs'])
@limiter.limit('6/minute')
async def import_logs(
    request: Request,
    items: List[MovieLogInput] = Body(..., embed=True),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Any:
    if not items:
        raise APIError(400, 'BAD_REQUEST', 'No items to import.')
    if len(items) > _MAX_IMPORT:
        raise APIError(
            413,
            'IMPORT_TOO_LARGE',
            f'Cannot import more than {_MAX_IMPORT} items at once.',
        )

    rows: list[dict[str, Any]] = []
    for item in items:
        row = _writable_row(item.model_dump())
        _enforce_image_prefix(current_user.user_id, row.get('ticket_image_path'))
        row['user_id'] = current_user.user_id
        rows.append(row)

    created = await supabase_rest.import_movie_logs(current_user.access_token, rows)
    LOGGER.info(
        'import_logs user={} count={}', _uid(current_user.user_id), len(created)
    )
    return {'imported': len(created), 'items': created}


@router.get('/{log_id}', response_model=MovieLog, tags=['Movie Logs'])
async def get_log(
    log_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Any:
    row = await supabase_rest.get_movie_log(
        current_user.access_token, current_user.user_id, log_id
    )
    if row is None:
        raise APIError(404, 'NOT_FOUND', 'Movie log not found.')
    return row


@router.patch('/{log_id}', response_model=MovieLog, tags=['Movie Logs'])
async def update_log(
    log_id: str,
    payload: MovieLogUpdate,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Any:
    patch = payload.model_dump(exclude_unset=True)
    patch = _writable_row(patch)
    if not patch:
        raise APIError(400, 'BAD_REQUEST', 'No fields provided to update.')
    _enforce_image_prefix(current_user.user_id, patch.get('ticket_image_path'))

    row = await supabase_rest.update_movie_log(
        current_user.access_token, current_user.user_id, log_id, patch
    )
    if row is None:
        raise APIError(404, 'NOT_FOUND', 'Movie log not found.')
    LOGGER.info('update_log user={} id={}', _uid(current_user.user_id), log_id)
    return row


@router.put('/{log_id}/venue-rating', tags=['Movie Logs'])
async def upsert_venue_rating(
    log_id: str,
    payload: VenueRatingInput,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Any:
    # Confirm the log exists and belongs to the caller before attaching a
    # rating to it — avoids creating an orphaned/foreign visit_venue_ratings
    # row if the log_id is wrong or belongs to someone else.
    log = await supabase_rest.get_movie_log(
        current_user.access_token, current_user.user_id, log_id
    )
    if log is None:
        raise APIError(404, 'NOT_FOUND', 'Movie log not found.')

    row = payload.model_dump(exclude_none=True)
    if not row:
        raise APIError(400, 'BAD_REQUEST', 'No rating fields provided.')

    row['movie_log_id'] = log_id
    row['user_id'] = current_user.user_id

    result = await supabase_rest.upsert_venue_rating(current_user.access_token, row)
    LOGGER.info('upsert_venue_rating user={} log_id={}', _uid(current_user.user_id), log_id)
    return result


@router.delete('/{log_id}', status_code=status.HTTP_204_NO_CONTENT, tags=['Movie Logs'])
async def delete_log(
    log_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> None:
    deleted = await supabase_rest.delete_movie_log(
        current_user.access_token, current_user.user_id, log_id
    )
    if not deleted:
        raise APIError(404, 'NOT_FOUND', 'Movie log not found.')
    LOGGER.info('delete_log user={} id={}', _uid(current_user.user_id), log_id)
