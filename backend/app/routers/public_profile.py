"""Public-facing profile search. Anonymous reads, authenticated username changes."""

from typing import Any, List

from auth.supabase_auth import AuthenticatedUser, get_current_user
from config import settings
from fastapi import APIRouter, Depends, Query, Request, status
from rate_limit import limiter
from responses.public_profile import responses
from schemas.public_profile import (
    AccountPrivacyUpdate,
    ProfileUpdate,
    PublicProfile,
    RevisitPrefillUpdate,
    UsernameUpdate,
)
from services import supabase_rest
from utils.errors import APIError

router = APIRouter()

_DEFAULT_LIMIT = f'{settings.default_rate_limit_per_minute}/minute'


@router.get(
    '/users/search',
    response_model=List[PublicProfile],
    tags=['Public'],
    description='Search users by username or display name. Public — no sign-in '
    'required, and unrestricted by privacy state — a private/followers-only '
    'account still turns up here, same as a private Instagram account would; '
    "`account_visibility` on each result tells the client whether it's worth "
    'showing a lock indicator before the caller taps in.',
    response_description='Matching profiles.',
    responses=responses['search_users'],
    operation_id='SearchPublicUsers',
)
@limiter.limit(_DEFAULT_LIMIT)
async def search_users(request: Request, q: str = Query(..., min_length=2)) -> Any:
    return await supabase_rest.search_public_users(q)


@router.get(
    '/users/{username}',
    tags=['Public'],
    description='A user\'s public profile. Resolves by username alone, so a link '
    "someone was already given keeps working forever (as long as the username "
    'itself does). Content depends on `account_visibility`: `public` shows '
    "every entry set to `visibility: public` (never `anonymous` ones — those "
    "intentionally never appear here); `followers_only`/`private` show an "
    'empty `logs` list — same "private account" behavior most social apps '
    'use, rather than 404ing. (`followers_only` becomes follow-aware in a '
    'later phase — for now it behaves like `private`.) Public — no sign-in '
    'required.',
    response_description='The profile shell, plus public logs if the account is public.',
    responses=responses['public_profile'],
    operation_id='GetPublicProfile',
)
@limiter.limit(_DEFAULT_LIMIT)
async def public_profile(request: Request, username: str) -> Any:
    profile = await supabase_rest.get_public_profile(username)
    if not profile:
        raise APIError(status.HTTP_404_NOT_FOUND, 'NOT_FOUND', 'User not found.')
    is_open = profile['account_visibility'] == 'public'
    logs = await supabase_rest.list_public_logs_for_user(profile['user_id']) if is_open else []
    return {'profile': profile, 'logs': logs}


@router.patch(
    '/me/username',
    tags=['Public'],
    description='Set or change the caller\'s username (lowercase letters, digits, '
    'underscore only; must be unique). This is what shows up in search and at '
    'GET /users/{username} — both work as soon as a username is set.',
    response_description="The caller's updated settings row.",
    responses=responses['set_username'],
    operation_id='SetUsername',
)
@limiter.limit(_DEFAULT_LIMIT)
async def set_username(
    request: Request,
    payload: UsernameUpdate,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Any:
    try:
        return await supabase_rest.update_username(
            current_user.access_token, current_user.user_id, payload.username
        )
    except APIError as e:
        if e.status_code == 400:
            # PostgREST surfaces the unique-index violation as a generic 4xx;
            # give the caller a clearer, stable error code to key off of.
            raise APIError(
                status.HTTP_409_CONFLICT,
                'USERNAME_TAKEN',
                'That username is already taken.',
            )
        raise


@router.patch(
    '/me/privacy',
    tags=['Public'],
    description='Set who can see the caller\'s content on GET /users/{username} '
    "and in followers' feeds — `public`, `followers_only`, or `private` (default). "
    'See `AccountPrivacyUpdate` for exactly what each tier means. Doesn\'t affect '
    "search: any tier can still turn up at GET /users/search, it just has nothing "
    'to show if someone opens it.',
    response_description="The caller's updated settings row.",
    responses=responses['set_privacy'],
    operation_id='SetAccountPrivacy',
)
@limiter.limit(_DEFAULT_LIMIT)
async def set_privacy(
    request: Request,
    payload: AccountPrivacyUpdate,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Any:
    return await supabase_rest.update_account_privacy(
        current_user.access_token, current_user.user_id, payload.account_visibility
    )


@router.patch(
    '/me/profile',
    tags=['Public'],
    description='Update the caller\'s display_name, bio, avatar_path, and/or '
    'profile_links (up to 5) in one call — only fields actually sent are '
    'changed. avatar_path is a Supabase Storage path in the public '
    'avatar-images bucket (client uploads directly to Storage; this only '
    'stores the resulting path string, same pattern as ticket_image_path on '
    'movie logs) — must be prefixed with the caller\'s own user_id, same rule '
    'ticket images already enforce.',
    response_description="The caller's updated settings row.",
    responses=responses['set_profile'],
    operation_id='UpdateProfile',
)
@limiter.limit(_DEFAULT_LIMIT)
async def update_profile(
    request: Request,
    payload: ProfileUpdate,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Any:
    patch = payload.model_dump(exclude_unset=True)
    if not patch:
        raise APIError(status.HTTP_400_BAD_REQUEST, 'EMPTY_UPDATE', 'No fields provided to update.')

    avatar_path = patch.get('avatar_path')
    if avatar_path and not avatar_path.startswith(f'{current_user.user_id}/'):
        raise APIError(
            status.HTTP_400_BAD_REQUEST,
            'INVALID_IMAGE_PATH',
            "avatar_path must be under the caller's own user_id prefix.",
        )
    return await supabase_rest.update_profile(
        current_user.access_token, current_user.user_id, patch
    )


@router.patch(
    '/me/revisit-prefill',
    tags=['Public'],
    description='Toggle what happens when the caller starts a new log at a theatre/ '
    "screen they've logged before. Off (default): the client should only suggest "
    "reusing the previous venue rating (tap to accept). On: the client may fill the "
    "new log's venue-rating fields from the most recent matching visit "
    'automatically. Purely a stored preference — GET /movie-logs?theatre_id=/'
    'screen_id=/movie= is what actually supplies the previous visit(s).',
    response_description="The caller's updated settings row.",
    responses=responses['set_revisit_prefill'],
    operation_id='SetRevisitPrefill',
)
@limiter.limit(_DEFAULT_LIMIT)
async def set_revisit_prefill(
    request: Request,
    payload: RevisitPrefillUpdate,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Any:
    return await supabase_rest.update_revisit_prefill(
        current_user.access_token, current_user.user_id, payload.prefill_repeat_visit
    )