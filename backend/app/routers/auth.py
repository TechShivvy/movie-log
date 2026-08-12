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

from auth.supabase_auth import AuthenticatedUser, get_current_user
from config import settings
from fastapi import APIRouter, Depends, Request, Response, status
from rate_limit import limiter
from responses.auth import responses
from schemas.auth import AccountDeletionRequest
from services import supabase_admin, supabase_rest

router = APIRouter()


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
    'Reddit-style instead: `private` movie logs, follow/block relationships, '
    'venue notes, profile (username/bio/avatar/links), and any reports the '
    'caller filed are all removed; `public`/`anonymous` movie logs and their '
    'venue ratings are kept (so theatre/screen review pages and rating '
    'averages the caller contributed to don\'t retroactively change), just no '
    'longer attributed to anyone — the same "username: null" shape already '
    'used for a profile that never set one. Irreversible. Requires '
    '`{"confirm": true}` in the body — DELETE requests commonly go out with '
    'no body at all, this exists to stop a bodyless/accidental call from '
    'going through; the bearer token is the real authorization.',
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
