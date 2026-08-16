"""Auth helper endpoints for standalone/API usage.

Lets developers verify that a pasted Supabase access token is valid and see the
identity it maps to (useful in Swagger's "Authorize" flow before calling the API),
and lets a signed-in user delete their own account.

Sign-up/sign-in/password-reset are deliberately not here — this app never puts
the backend between a client and Supabase Auth for those (same reasoning as
Google sign-in, see plan.md): the client already holds the public
anon/publishable key, so a backend passthrough for
`resetPasswordForEmail`/`updateUser` would add no real security, only a
detour. Verified end-to-end instead via backend/scripts/verify-password-reset.sh,
which exercises the real Supabase Auth API the same way a frontend would.
"""

from typing import Any

from auth.supabase_auth import AuthenticatedUser, get_current_user
from config import settings
from fastapi import APIRouter, Depends, Request, Response, status
from loguru_setup import LOGGER
from rate_limit import limiter
from responses.auth import responses
from schemas.auth import (
    AccountDeletionRequest,
    AccountExport,
    AccountImportRequest,
    AccountImportResult,
)
from schemas.movie_logs import WRITABLE_FIELDS
from services import supabase_admin, supabase_rest
from utils.errors import APIError

router = APIRouter()

_MAX_IMPORT = 500


@router.get(
    '/me',
    tags=['Auth'],
    description='Verify a Supabase access token and see the identity it maps to.',
    response_description='The identity mapped from the access token.',
    responses=responses['me'],
    operation_id='WhoAmI',
)
@limiter.limit(f'{settings.default_rate_limit_per_minute}/minute')
async def me(
    request: Request, current_user: AuthenticatedUser = Depends(get_current_user)
) -> dict:
    return {'user_id': current_user.user_id, 'email': current_user.email}


@router.delete(
    '/me',
    tags=['Auth'],
    status_code=status.HTTP_204_NO_CONTENT,
    description='Permanently delete the caller\'s own account. Not a full wipe — '
    'private content is removed, shared contributions are kept and anonymized '
    'instead: `private` movie logs, follow/block relationships, '
    'venue notes, profile (username/bio/avatar/links), and any reports the '
    'caller filed are all removed; `public`/`anonymous` movie logs, their '
    'venue ratings, and their comments (including replies the caller left on '
    'other people\'s logs) are kept (so theatre/screen review pages, rating '
    'averages, and comment threads the caller contributed to don\'t '
    'retroactively change or orphan), just no longer attributed to anyone — '
    'the same "username: null" shape already used for a profile that never '
    'set one. Likes the caller gave or received are removed outright, not '
    'anonymized — a like carries no content worth keeping once its giver is '
    'gone. Any stored provider API keys (PUT /public/me/llm-keys/{provider}) '
    "are removed outright too — a FK cascade, not application code, so it "
    "can't be accidentally skipped. Irreversible. Requires "
    '`{"confirm": true}` in the body — DELETE '
    'requests commonly go out with no body at all, this exists to stop a '
    'bodyless/accidental call from going through; the bearer token is the '
    'real authorization.',
    response_description='No content — the account and its owned data are gone.',
    responses=responses['delete_account'],
    operation_id='DeleteAccount',
)
@limiter.limit(f'{settings.default_rate_limit_per_minute}/minute')
async def delete_account(
    request: Request,
    payload: AccountDeletionRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Response:
    await supabase_rest.delete_private_movie_logs(
        current_user.access_token, current_user.user_id
    )
    await supabase_admin.delete_user_storage(current_user.user_id)
    await supabase_admin.delete_auth_user(current_user.user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    '/me/export',
    response_model=AccountExport,
    tags=['Auth'],
    description="Everything about the caller's account in one payload: "
    'profile, every movie log with its venue rating (if any) nested inline, '
    'and venue notes — for backup, or to feed into POST /me/import on '
    'another account. Distinct from GET /movie-logs/export, which covers '
    'bare log rows only, no rating/profile/notes.',
    response_description="The caller's full account data.",
    responses=responses['export_account'],
    operation_id='ExportAccount',
)
@limiter.limit(f'{settings.default_rate_limit_per_minute}/minute')
async def export_account(
    request: Request, current_user: AuthenticatedUser = Depends(get_current_user)
) -> dict:
    profile = await supabase_rest.get_own_settings(
        current_user.access_token, current_user.user_id
    )
    logs = await supabase_rest.export_movie_logs_with_ratings(
        current_user.access_token, current_user.user_id
    )
    notes = await supabase_rest.export_venue_notes(
        current_user.access_token, current_user.user_id
    )
    return {'profile': profile, 'movie_logs': logs, 'venue_notes': notes}


@router.post(
    '/me/import',
    response_model=AccountImportResult,
    tags=['Auth'],
    description='Restores content from a GET /me/export payload — movie logs '
    '(+ their nested venue_rating, in the same call instead of a separate PUT '
    '.../venue-rating per log) and venue notes. Profile fields are '
    'deliberately not imported — the caller is already signed in as '
    f'themselves. Capped at {_MAX_IMPORT} items per list, same as POST '
    '/movie-logs/import.',
    response_description='How many of each were imported.',
    responses=responses['import_account'],
    operation_id='ImportAccount',
)
@limiter.limit('6/minute')
async def import_account(
    request: Request,
    payload: AccountImportRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Any:
    if not payload.movie_logs and not payload.venue_notes:
        raise APIError(status.HTTP_400_BAD_REQUEST, 'BAD_REQUEST', 'No items to import.')
    for items, label in ((payload.movie_logs, 'movie_logs'), (payload.venue_notes, 'venue_notes')):
        if len(items) > _MAX_IMPORT:
            raise APIError(
                status.HTTP_413_CONTENT_TOO_LARGE,
                'IMPORT_TOO_LARGE',
                f'Cannot import more than {_MAX_IMPORT} {label} at once.',
            )

    logs_imported = 0
    ratings_imported = 0
    for item in payload.movie_logs:
        data = item.model_dump(exclude={'venue_rating'})
        row = {k: data[k] for k in WRITABLE_FIELDS if k in data}
        image_path = row.get('ticket_image_path')
        if image_path and not image_path.startswith(f'{current_user.user_id}/'):
            raise APIError(
                status.HTTP_400_BAD_REQUEST,
                'INVALID_IMAGE_PATH',
                "ticket_image_path must live under the caller's own storage prefix.",
            )
        row['user_id'] = current_user.user_id
        created = await supabase_rest.create_movie_log(current_user.access_token, row)
        logs_imported += 1

        if item.venue_rating:
            rating_row = item.venue_rating.model_dump(exclude_none=True)
            if rating_row:
                rating_row['movie_log_id'] = created['id']
                rating_row['user_id'] = current_user.user_id
                await supabase_rest.upsert_venue_rating(current_user.access_token, rating_row)
                ratings_imported += 1

    notes_imported = 0
    for note in payload.venue_notes:
        await supabase_rest.upsert_venue_note(
            current_user.access_token, current_user.user_id, note.note,
            theatre_id=note.theatre_id, screen_id=note.screen_id,
        )
        notes_imported += 1

    LOGGER.info(
        'import_account user={} logs={} ratings={} notes={}',
        current_user.user_id[:8], logs_imported, ratings_imported, notes_imported,
    )
    return AccountImportResult(
        movie_logs_imported=logs_imported,
        venue_ratings_imported=ratings_imported,
        venue_notes_imported=notes_imported,
    )
