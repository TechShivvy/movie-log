"""Public-facing profile search. Anonymous reads (optionally identity-aware,
for block-filtering — see get_current_user_optional), authenticated
username/profile/privacy changes."""

from typing import Any, List, Optional

from auth.supabase_auth import AuthenticatedUser, get_current_user, get_current_user_optional
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
    'showing a lock indicator before the caller taps in. If a bearer token IS '
    'sent, results exclude anyone the caller has blocked or been blocked by, '
    'in either direction.',
    response_description='Matching profiles.',
    responses=responses['search_users'],
    operation_id='SearchPublicUsers',
)
@limiter.limit(_DEFAULT_LIMIT)
async def search_users(
    request: Request,
    q: str = Query(..., min_length=2),
    current_user: Optional[AuthenticatedUser] = Depends(get_current_user_optional),
) -> Any:
    viewer_token = current_user.access_token if current_user else None
    return await supabase_rest.search_public_users(q, viewer_token=viewer_token)


@router.get(
    '/users/{username}',
    tags=['Public'],
    description='A user\'s public profile. Resolves by username alone, so a link '
    "someone was already given keeps working forever (as long as the username "
    "itself does) — unless the caller and this user have blocked each other "
    'in either direction, in which case this 404s exactly like the user does '
    "not exist, rather than confirming a block. Content depends on whether "
    'the caller can view it: `public` accounts show every entry set to '
    "`visibility: public` (never `anonymous` ones — those intentionally never "
    'appear here) to anyone; `followers_only` accounts show it only to '
    "accepted followers (send a bearer token to be recognized as one); "
    "`private` accounts show it to nobody but the owner. Otherwise `logs` is "
    'an empty list — same "private account" behavior most social apps use, '
    'rather than 404ing. Public — no sign-in required, but sending a token '
    "lets the response reflect the caller's own follow access.",
    response_description='The profile shell, plus public logs if the caller can view them.',
    responses=responses['public_profile'],
    operation_id='GetPublicProfile',
)
@limiter.limit(_DEFAULT_LIMIT)
async def public_profile(
    request: Request,
    username: str,
    current_user: Optional[AuthenticatedUser] = Depends(get_current_user_optional),
) -> Any:
    viewer_token = current_user.access_token if current_user else None
    profile = await supabase_rest.get_public_profile(username, viewer_token=viewer_token)
    if not profile or profile['is_blocked']:
        # Same 404 either way — a block should never be distinguishable
        # from "this user doesn't exist" to the blocked/blocking party.
        raise APIError(status.HTTP_404_NOT_FOUND, 'NOT_FOUND', 'User not found.')
    logs = (
        await supabase_rest.list_public_logs_for_user(profile['user_id'])
        if profile['can_view_content']
        else []
    )
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