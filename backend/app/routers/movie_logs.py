"""Standalone movie-log CRUD + export/import API.

All endpoints require a Supabase access token (Bearer). Data access goes through
PostgREST using that token, so Supabase RLS scopes every operation to the caller.
Server-managed fields (id/user_id/created_at/updated_at) are never taken from the
client, preventing mass-assignment / cross-user writes.
"""

from typing import Annotated, Any, List, Literal, Optional

from auth.supabase_auth import AuthenticatedUser, get_current_user, get_current_user_optional
from config import settings
from fastapi import APIRouter, Body, Depends, Query, Request, status
from loguru_setup import LOGGER
from responses.movie_logs import responses
from schemas.likes import Liker
from schemas.movie_logs import (
    WRITABLE_FIELDS,
    FavoritePositionUpdate,
    MovieLog,
    MovieLogInput,
    MovieLogPhoto,
    MovieLogPhotoInput,
    MovieLogSearchResult,
    MovieLogUpdate,
    TheatrePlaceInput,
    VenueRating,
)
from schemas.venues import VenueRatingInput
from services import supabase_rest, venue_resolution
from utils.errors import APIError

from rate_limit import limiter

_DEFAULT_LIMIT = f'{settings.default_rate_limit_per_minute}/minute'

router = APIRouter()

_MAX_IMPORT = 500
_SORT_FIELDS = {'created_at', 'updated_at', 'watched_date', 'movie'}
_MAX_PHOTOS_PER_LOG = 10


def _uid(user_id: str) -> str:
    """Return a redacted uid safe to log (first 8 chars + ellipsis)."""
    return f'{user_id[:8]}…' if len(user_id) > 8 else user_id


def _enforce_image_prefix(user_id: str, path: str | None, field: str = 'ticket_image_path') -> None:
    if path and not path.startswith(f'{user_id}/'):
        raise APIError(
            status.HTTP_400_BAD_REQUEST,
            'INVALID_IMAGE_PATH',
            f"{field} must live under the user's own storage prefix.",
        )


def _writable_row(payload: dict[str, Any]) -> dict[str, Any]:
    return {k: payload[k] for k in WRITABLE_FIELDS if k in payload}


async def _resolve_theatre_and_screen(
    current_user: AuthenticatedUser, row: dict[str, Any], theatre_place: TheatrePlaceInput | None,
) -> None:
    """Mutates `row` in place — resolves `theatre_id`/`screen_id` before the
    log itself is written, so a client can submit a Places identity + a
    free-text screen name in one call instead of pre-creating the
    theatre/screen first (see MovieLogInput.theatre_place). Resolution order:
    an explicit `theatre_id` already in `row` always wins over `theatre_place`
    (unchanged behavior either way); a screen only gets resolved if no
    `screen_id` is already present, a theatre was resolved by one of the two
    paths above, and `row['screen']` (the free-text field) is non-empty —
    the free-text `theater`/`screen` mirror columns themselves are never
    touched by this, same values the client sent are still saved there.
    """

    theatre_id = row.get('theatre_id')
    if not theatre_id and theatre_place is not None:
        theatre = await venue_resolution.resolve_or_create_theatre(
            current_user.access_token,
            current_user.user_id,
            theatre_place.model_dump(exclude_none=True),
        )
        theatre_id = theatre['id']
        row['theatre_id'] = theatre_id

    screen_name = row.get('screen')
    if not row.get('screen_id') and theatre_id and screen_name:
        screen = await venue_resolution.resolve_or_create_screen(
            current_user.access_token, current_user.user_id, theatre_id, screen_name,
        )
        row['screen_id'] = screen['id']


@router.get(
    '',
    response_model=List[MovieLog],
    tags=['Movie Logs'],
    description="List the caller's own movie logs, newest first by default. Optional "
    '`theatre_id`/`screen_id`/`movie`/`movie_id` filters narrow this to the caller\'s '
    'own past visits to a venue or past logs of a movie — e.g. to answer "have I been '
    'here before?" for a revisit-prefill suggestion, or to show a "my visits to this '
    'theatre" history (`movie` matches the free-typed title text exactly; `movie_id` '
    'matches the linked catalog entry — use whichever the caller already has in '
    'hand). `favorites_only` returns just the caller\'s up-to-4 favorite '
    'logs (see PUT .../favorite), any visibility — this is the caller\'s own '
    "view; GET /public/users/{username} exposes only the public ones. Archived "
    "logs (see PATCH /{id} is_archived) are excluded by default, from the "
    "caller's own list too, not just everyone else's — cold storage means "
    'genuinely put away; `archived_only` flips this to show just the archive '
    "instead. Unlike GET /venues/theatres/{id}/reviews, this always includes "
    "the caller's `private` logs too (it's their own data, scoped by RLS).",
    response_description='A page of movie logs.',
    responses=responses['list_logs'],
    operation_id='ListMovieLogs',
)
@limiter.limit(_DEFAULT_LIMIT)
async def list_logs(
    request: Request,
    current_user: AuthenticatedUser = Depends(get_current_user),
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    sort: Literal['created_at', 'updated_at', 'watched_date', 'movie'] = 'created_at',
    order: Literal['asc', 'desc'] = 'desc',
    theatre_id: Annotated[str | None, Query()] = None,
    screen_id: Annotated[str | None, Query()] = None,
    movie: Annotated[str | None, Query(min_length=1)] = None,
    movie_id: Annotated[str | None, Query()] = None,
    favorites_only: Annotated[bool, Query()] = False,
    archived_only: Annotated[bool, Query()] = False,
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
        theatre_id=theatre_id,
        screen_id=screen_id,
        favorites_only=favorites_only,
        archived_only=archived_only,
        movie=movie,
        movie_id=movie_id,
    )


@router.post(
    '',
    response_model=MovieLog,
    status_code=201,
    tags=['Movie Logs'],
    description='Create a movie log for the caller. `movie` and a real venue link '
    'are both required — the app is screening-focused, a log with no theatre '
    'attached is incomplete. Give either `theatre_id` (an existing theatre) or '
    '`theatre_place` (resolved/created inline, see its own description); a bare '
    '`theater` free-text string with neither is not enough. Everything else — '
    '`screen_id`/`screen`, or sharing it via `visibility` (private/anonymous/'
    'public — see GET /venues/theatres/{id}/reviews) — can be set now or added '
    'later with PATCH.',
    response_description='The created log.',
    responses=responses['create_log'],
    operation_id='CreateMovieLog',
)
@limiter.limit('30/minute')
async def create_log(
    request: Request,
    payload: MovieLogInput,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Any:
    row = _writable_row(payload.model_dump())
    if not row.get('movie'):
        raise APIError(
            status.HTTP_400_BAD_REQUEST,
            'MISSING_MOVIE_TITLE',
            'movie title is required when creating a log.',
        )
    await _resolve_theatre_and_screen(current_user, row, payload.theatre_place)
    if not row.get('theatre_id'):
        # The row-level check after resolution is the real enforcement
        # point, regardless of how a caller got here — no theatre_id and
        # no theatre_place, or a theatre_place that somehow failed to
        # resolve to one (shouldn't normally happen given
        # resolve_or_create_theatre's own fallback behavior). Deliberately
        # app-layer only: existing rows already have a null theatre_id, so
        # a DB-level NOT NULL would break them.
        raise APIError(
            status.HTTP_400_BAD_REQUEST,
            'MISSING_THEATRE',
            'A theatre is required when creating a log — set theatre_id, or '
            'theatre_place to resolve/create one.',
        )
    _enforce_image_prefix(current_user.user_id, row.get('ticket_image_path'))
    row['user_id'] = current_user.user_id
    LOGGER.info('create_log user={}', _uid(current_user.user_id))
    return await supabase_rest.create_movie_log(current_user.access_token, row)


@router.get(
    '/export',
    tags=['Movie Logs'],
    description='Export every one of the caller\'s logs as a single JSON payload — '
    'for backup, or to feed straight into POST /import on another account.',
    response_description="All of the caller's logs.",
    responses=responses['export_logs'],
    operation_id='ExportMovieLogs',
)
@limiter.limit(_DEFAULT_LIMIT)
async def export_logs(
    request: Request,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Any:
    rows = await supabase_rest.export_movie_logs(
        current_user.access_token, current_user.user_id
    )
    LOGGER.info('export_logs user={} count={}', _uid(current_user.user_id), len(rows))
    return {'count': len(rows), 'items': rows}


@router.post(
    '/import',
    tags=['Movie Logs'],
    description='Bulk-create logs, e.g. from a previous GET /export. Capped at 500 '
    'items per request; each item goes through the same validation as a single '
    'POST /, and is assigned to the caller regardless of any user_id in the payload.',
    response_description='How many logs were created, plus the created rows.',
    responses=responses['import_logs'],
    operation_id='ImportMovieLogs',
)
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


@router.get(
    '/search',
    response_model=List[MovieLogSearchResult],
    tags=['Movie Logs'],
    description="Fuzzy, multi-field search over the caller's own logs — movie, "
    "theater, screen, seats, language, and notes are all matched (trigram "
    "similarity, not exact substring), so a partial or slightly-misspelled "
    "query still finds a log. Each result's `matched_fields` names which of "
    "those six actually matched, for the frontend to highlight — not a "
    "duplicate of their values, those are already on the same object. "
    "`theatre_id`/`screen_id`/`favorites_only` narrow the search server-side "
    "(same filters GET / already has), and `sort`/`order` are also applied "
    "server-side — both matter once "
    "there's more than one page of matches, where a client-side version "
    "would silently only affect the currently-loaded page. Registered "
    "before GET /{log_id} so the literal path segment \"search\" is never "
    "swallowed by that route's {log_id} pattern.",
    response_description='Matching logs, most relevant first by default.',
    responses=responses['search_logs'],
    operation_id='SearchMovieLogs',
)
@limiter.limit(_DEFAULT_LIMIT)
async def search_logs(
    request: Request,
    q: Annotated[str, Query(min_length=1, max_length=300)],
    current_user: AuthenticatedUser = Depends(get_current_user),
    theatre_id: Annotated[str | None, Query()] = None,
    screen_id: Annotated[str | None, Query()] = None,
    favorites_only: Annotated[bool, Query()] = False,
    archived_only: Annotated[bool, Query()] = False,
    sort: Literal['relevance', 'created_at', 'updated_at', 'watched_date', 'movie'] = 'relevance',
    order: Literal['asc', 'desc'] = 'desc',
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> Any:
    return await supabase_rest.search_movie_logs(
        current_user.access_token,
        query=q,
        theatre_id=theatre_id,
        screen_id=screen_id,
        favorites_only=favorites_only,
        archived_only=archived_only,
        sort=sort,
        order=order,
        limit=limit,
        offset=offset,
    )


@router.get(
    '/{log_id}',
    response_model=MovieLog,
    tags=['Movie Logs'],
    description="Fetch a single log the caller owns. Returns 404 (not 403) if the "
    "log belongs to someone else — RLS makes 'not yours' and 'does not exist' "
    "indistinguishable on purpose.",
    response_description='The requested log.',
    responses=responses['get_log'],
    operation_id='GetMovieLog',
)
@limiter.limit(_DEFAULT_LIMIT)
async def get_log(
    request: Request,
    log_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Any:
    row = await supabase_rest.get_movie_log(
        current_user.access_token, current_user.user_id, log_id
    )
    if row is None:
        raise APIError(404, 'NOT_FOUND', 'Movie log not found.')
    return row


@router.patch(
    '/{log_id}',
    response_model=MovieLog,
    tags=['Movie Logs'],
    description='Partially update a log — only send the fields you want to change. '
    'At least one field (including `theatre_place` alone) is required. Omitting '
    'theatre_id entirely (a patch that isn\'t touching venue at all) is always '
    'fine, but explicitly sending `theatre_id: null` with no `theatre_place` to '
    "replace it is rejected — every log requires a real venue link (see POST /), "
    "so an existing one can't be edited back out of that.",
    response_description='The updated log.',
    responses=responses['update_log'],
    operation_id='UpdateMovieLog',
)
@limiter.limit(_DEFAULT_LIMIT)
async def update_log(
    request: Request,
    log_id: str,
    payload: MovieLogUpdate,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Any:
    patch = payload.model_dump(exclude_unset=True)
    patch = _writable_row(patch)
    if not patch and not payload.theatre_place:
        raise APIError(400, 'BAD_REQUEST', 'No fields provided to update.')
    await _resolve_theatre_and_screen(current_user, patch, payload.theatre_place)
    if 'theatre_id' in patch and not patch['theatre_id']:
        # An explicit theatre_id: null with nothing to replace it — same
        # requirement POST / enforces on create, just checked here so an
        # already-compliant log can't be edited back out of it. Omitting
        # theatre_id from the patch entirely never reaches this branch
        # (exclude_unset means it's simply absent from `patch`).
        raise APIError(
            status.HTTP_400_BAD_REQUEST,
            'MISSING_THEATRE',
            'A theatre is required — clearing theatre_id needs a theatre_place '
            'to replace it with.',
        )
    _enforce_image_prefix(current_user.user_id, patch.get('ticket_image_path'))

    row = await supabase_rest.update_movie_log(
        current_user.access_token, current_user.user_id, log_id, patch
    )
    if row is None:
        raise APIError(404, 'NOT_FOUND', 'Movie log not found.')
    LOGGER.info('update_log user={} id={}', _uid(current_user.user_id), log_id)
    return row


@router.put(
    '/{log_id}/venue-rating',
    tags=['Movie Logs'],
    description='Rate the venue (screen/speaker/AC/seat, each optional, half-star '
    '0.5-5.0) for one of the caller\'s own logs. One rating per log — calling this '
    "again replaces the previous values. Feeds the theatre/screen aggregate stats "
    'at GET /venues/theatres/{id}/stats and /venues/screens/{id}/stats.',
    response_description='The stored venue-rating row.',
    responses=responses['upsert_venue_rating'],
    operation_id='UpsertVenueRating',
)
@limiter.limit(_DEFAULT_LIMIT)
async def upsert_venue_rating(
    request: Request,
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


@router.get(
    '/{log_id}/venue-rating',
    response_model=VenueRating,
    tags=['Movie Logs'],
    description="Fetch the caller's own venue rating (screen/speaker/AC/seat) "
    "for one of their own logs. Returns 404 (not 403) if no rating exists for "
    "that log, or if the log belongs to someone else — same 'not yours' and "
    "'does not exist' indistinguishable-on-purpose pattern as GET /{log_id}.",
    response_description="The caller's stored venue-rating row.",
    responses=responses['get_venue_rating'],
    operation_id='GetVenueRating',
)
@limiter.limit(_DEFAULT_LIMIT)
async def get_venue_rating(
    request: Request,
    log_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Any:
    row = await supabase_rest.get_venue_rating(
        current_user.access_token, current_user.user_id, log_id
    )
    if row is None:
        raise APIError(404, 'NOT_FOUND', 'No venue rating for this log.')
    return row


@router.delete(
    '/{log_id}/venue-rating',
    status_code=status.HTTP_204_NO_CONTENT,
    tags=['Movie Logs'],
    description="Remove the venue rating from one of the caller's own logs, "
    'without deleting the log itself — e.g. after correcting theatre_id/'
    "screen_id on PATCH /{log_id} (the old rating no longer applies to the "
    'corrected venue), or simply changing your mind about it. Immediately '
    "reflected in the theatre/screen's aggregate stats, same as any other "
    'rating change.',
    responses=responses['delete_venue_rating'],
    operation_id='DeleteVenueRating',
)
@limiter.limit(_DEFAULT_LIMIT)
async def delete_venue_rating(
    request: Request,
    log_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> None:
    deleted = await supabase_rest.delete_venue_rating(
        current_user.access_token, current_user.user_id, log_id
    )
    if not deleted:
        raise APIError(404, 'NOT_FOUND', 'No venue rating for this log.')
    LOGGER.info('delete_venue_rating user={} log_id={}', _uid(current_user.user_id), log_id)


@router.post(
    '/{log_id}/photos',
    response_model=MovieLogPhoto,
    status_code=201,
    tags=['Movie Logs'],
    description="Attach one tagged photo to one of the caller's own logs — up "
    "to 10 per log. Not for the ticket photo itself; that stays PATCH "
    "/{log_id} ticket_image_path, always owner-only regardless of the log's "
    "visibility (see the tag values below — none of them means \"ticket\"). "
    "`storage_path` must already exist in Supabase Storage under the "
    "caller's own prefix — the client uploads to the 'movie-log-photos' "
    'bucket first, then calls this to attach it, same two-step flow '
    'ticket_image_path already uses.',
    response_description='The stored photo row.',
    responses=responses['add_movie_log_photo'],
    operation_id='AddMovieLogPhoto',
)
@limiter.limit(_DEFAULT_LIMIT)
async def add_movie_log_photo(
    request: Request,
    log_id: str,
    payload: MovieLogPhotoInput,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Any:
    # Same ownership-before-write posture as PUT .../venue-rating — avoids
    # attaching a photo to an orphaned/foreign log if log_id is wrong or
    # belongs to someone else.
    log = await supabase_rest.get_movie_log(
        current_user.access_token, current_user.user_id, log_id
    )
    if log is None:
        raise APIError(404, 'NOT_FOUND', 'Movie log not found.')

    _enforce_image_prefix(current_user.user_id, payload.storage_path, field='storage_path')

    existing = await supabase_rest.list_movie_log_photos(
        current_user.access_token, current_user.user_id, log_id
    )
    if len(existing) >= _MAX_PHOTOS_PER_LOG:
        raise APIError(
            400,
            'PHOTO_LIMIT_REACHED',
            f'A movie log may have at most {_MAX_PHOTOS_PER_LOG} photos.',
        )

    row = {
        'movie_log_id': log_id,
        'user_id': current_user.user_id,
        'storage_path': payload.storage_path,
        'tag': payload.tag,
    }
    result = await supabase_rest.create_movie_log_photo(current_user.access_token, row)
    LOGGER.info(
        'add_movie_log_photo user={} log_id={} tag={}',
        _uid(current_user.user_id), log_id, payload.tag,
    )
    return result


@router.get(
    '/{log_id}/photos',
    response_model=List[MovieLogPhoto],
    tags=['Movie Logs'],
    description="List every tagged photo on one of the caller's own logs, "
    "oldest first. Returns 404 (not 403) if the log belongs to someone "
    "else — same 'not yours' and 'does not exist' indistinguishable-on-"
    'purpose pattern as GET /{log_id}.',
    response_description="The log's photos.",
    responses=responses['list_movie_log_photos'],
    operation_id='ListMovieLogPhotos',
)
@limiter.limit(_DEFAULT_LIMIT)
async def list_movie_log_photos(
    request: Request,
    log_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Any:
    log = await supabase_rest.get_movie_log(
        current_user.access_token, current_user.user_id, log_id
    )
    if log is None:
        raise APIError(404, 'NOT_FOUND', 'Movie log not found.')
    return await supabase_rest.list_movie_log_photos(
        current_user.access_token, current_user.user_id, log_id
    )


@router.delete(
    '/{log_id}/photos/{photo_id}',
    status_code=status.HTTP_204_NO_CONTENT,
    tags=['Movie Logs'],
    description="Remove one photo from one of the caller's own logs — the "
    'log and its other photos are untouched.',
    responses=responses['delete_movie_log_photo'],
    operation_id='DeleteMovieLogPhoto',
)
@limiter.limit(_DEFAULT_LIMIT)
async def delete_movie_log_photo(
    request: Request,
    log_id: str,
    photo_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> None:
    deleted = await supabase_rest.delete_movie_log_photo(
        current_user.access_token, current_user.user_id, log_id, photo_id
    )
    if not deleted:
        raise APIError(404, 'NOT_FOUND', 'Photo not found.')
    LOGGER.info(
        'delete_movie_log_photo user={} log_id={} photo_id={}',
        _uid(current_user.user_id), log_id, photo_id,
    )


@router.put(
    '/{log_id}/favorite',
    response_model=MovieLog,
    tags=['Movie Logs'],
    description='Mark one of the caller\'s own logs as a favorite (Letterboxd-'
    'style "Top 4"), in slot `position` (1-4). If another of the caller\'s logs '
    'already holds that slot, it\'s atomically moved out (favorite_position set '
    "to null) and this log takes it — a move, not a 409 requiring the client to "
    'clear the old slot first. A `private` favorite still occupies its slot '
    "(visible via GET /movie-logs?favorites_only=true), it just never appears "
    "in GET /public/users/{username}'s public favorites list.",
    response_description="The log's updated row.",
    responses=responses['set_favorite'],
    operation_id='SetFavoriteLog',
)
@limiter.limit(_DEFAULT_LIMIT)
async def set_favorite(
    request: Request,
    log_id: str,
    payload: FavoritePositionUpdate,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Any:
    try:
        result = await supabase_rest.set_favorite(
            current_user.access_token, log_id, payload.position
        )
    except APIError as e:
        if e.status_code == 400:
            # set_favorite_position raises when log_id isn't the caller's
            # own — same 404-not-403 posture as every other own-resource
            # lookup in this router.
            raise APIError(404, 'NOT_FOUND', 'Movie log not found.')
        raise
    LOGGER.info(
        'set_favorite user={} log_id={} position={}',
        _uid(current_user.user_id), log_id, payload.position,
    )
    return result


@router.delete(
    '/{log_id}/favorite',
    status_code=status.HTTP_204_NO_CONTENT,
    tags=['Movie Logs'],
    description="Unfavorite one of the caller's own logs, freeing its slot for "
    'reuse — the log itself is untouched.',
    responses=responses['delete_favorite'],
    operation_id='DeleteFavoriteLog',
)
@limiter.limit(_DEFAULT_LIMIT)
async def delete_favorite(
    request: Request,
    log_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> None:
    deleted = await supabase_rest.delete_favorite(
        current_user.access_token, current_user.user_id, log_id
    )
    if not deleted:
        raise APIError(404, 'NOT_FOUND', 'This log is not currently a favorite.')
    LOGGER.info('delete_favorite user={} log_id={}', _uid(current_user.user_id), log_id)


@router.post(
    '/{log_id}/like',
    tags=['Movie Logs'],
    description='Like a log — a single reaction, no dislike/downvote exists. '
    'Requires the log to be currently public/anonymous-visible and not '
    "archived, same rule commenting already follows; a blocked pair can't "
    "like each other's `public` (attributed) logs. Liking twice is a no-op, "
    "not an error — same call either way.",
    response_description='The updated like count.',
    responses=responses['like_log'],
    operation_id='LikeMovieLog',
)
@limiter.limit(_DEFAULT_LIMIT)
async def like_log(
    request: Request,
    log_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Any:
    if not await supabase_rest.is_movie_log_reportable(log_id):
        raise APIError(404, 'NOT_FOUND', 'Movie log not found.')
    try:
        count = await supabase_rest.like_movie_log(
            current_user.access_token, log_id, current_user.user_id
        )
    except APIError as e:
        if e.status_code == 400:
            # Either a blocked pair, or the same (log_id, user_id) pair
            # already exists (primary key conflict) — liking twice should
            # be a no-op, not an error, so fall back to just returning the
            # current count instead of surfacing this as a failure. Can't
            # tell the two cases apart from the collapsed 400
            # _raise_for_upstream produces, so this covers both.
            return {'like_count': await supabase_rest.get_like_count(log_id)}
        raise
    return {'like_count': count}


@router.delete(
    '/{log_id}/like',
    tags=['Movie Logs'],
    description='Unlike a log. Not liking it in the first place is a no-op, '
    'not an error — same call either way.',
    response_description='The updated like count.',
    responses=responses['unlike_log'],
    operation_id='UnlikeMovieLog',
)
@limiter.limit(_DEFAULT_LIMIT)
async def unlike_log(
    request: Request,
    log_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Any:
    await supabase_rest.unlike_movie_log(
        current_user.access_token, log_id, current_user.user_id
    )
    return {'like_count': await supabase_rest.get_like_count(log_id)}


@router.get(
    '/{log_id}/likes',
    response_model=List[Liker],
    tags=['Movie Logs'],
    description="Who liked this log, most recent first. Visible to anyone who "
    'could see the log itself — currently public/anonymous-visible and not '
    "archived, or the caller's own log regardless of its current visibility "
    '(same gate GET .../comments already applies, not a separate rule) — a '
    "log that never satisfies that gate simply has an empty list here rather "
    'than 404ing, same convention GET /venues/theatres/{id}/reviews follows. '
    'Public — no sign-in required, but a token lets an owner see likes on '
    'their own no-longer-public log.',
    response_description='Likers, most recent first.',
    responses=responses['list_log_likes'],
    operation_id='ListMovieLogLikes',
)
@limiter.limit(_DEFAULT_LIMIT)
async def list_log_likes(
    request: Request,
    log_id: str,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
    current_user: Optional[AuthenticatedUser] = Depends(get_current_user_optional),
) -> Any:
    viewer_token = current_user.access_token if current_user else None
    return await supabase_rest.list_movie_log_likes(
        log_id, limit=limit, offset=offset, viewer_token=viewer_token
    )


@router.delete(
    '/{log_id}',
    status_code=status.HTTP_204_NO_CONTENT,
    tags=['Movie Logs'],
    description='Permanently delete one of the caller\'s own logs (and its venue '
    'rating, if any — cascades in the database).',
    responses=responses['delete_log'],
    operation_id='DeleteMovieLog',
)
@limiter.limit(_DEFAULT_LIMIT)
async def delete_log(
    request: Request,
    log_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> None:
    deleted = await supabase_rest.delete_movie_log(
        current_user.access_token, current_user.user_id, log_id
    )
    if not deleted:
        raise APIError(404, 'NOT_FOUND', 'Movie log not found.')
    LOGGER.info('delete_log user={} id={}', _uid(current_user.user_id), log_id)
