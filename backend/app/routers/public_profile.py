"""Public-facing profile search. Anonymous reads, authenticated username changes."""

from typing import Any, List

from auth.supabase_auth import AuthenticatedUser, get_current_user
from config import settings
from fastapi import APIRouter, Depends, Query, Request, status
from rate_limit import limiter
from responses.public_profile import responses
from schemas.public_profile import (
    DiscoverabilityUpdate,
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
    description='Search discoverable users by username or display name. Public — no '
    'sign-in required. Only users who opted in via PATCH /me/discoverability show up.',
    response_description='Matching discoverable profiles.',
    responses=responses['search_users'],
    operation_id='SearchPublicUsers',
)
@limiter.limit(_DEFAULT_LIMIT)
async def search_users(request: Request, q: str = Query(..., min_length=2)) -> Any:
    return await supabase_rest.search_public_users(q)


@router.get(
    '/users/{username}',
    tags=['Public'],
    description="A discoverable user's public profile plus every log they've set to "
    "`visibility: public` (not `anonymous` ones — those intentionally never appear "
    'here). Public — no sign-in required.',
    response_description='The profile and its public logs.',
    responses=responses['public_profile'],
    operation_id='GetPublicProfile',
)
@limiter.limit(_DEFAULT_LIMIT)
async def public_profile(request: Request, username: str) -> Any:
    profile = await supabase_rest.get_public_profile(username)
    if not profile:
        raise APIError(status.HTTP_404_NOT_FOUND, 'NOT_FOUND', 'User not found.')
    logs = await supabase_rest.list_public_logs_for_user(profile['user_id'])
    return {'profile': profile, 'logs': logs}


@router.patch(
    '/me/username',
    tags=['Public'],
    description='Set or change the caller\'s username (lowercase letters, digits, '
    'underscore only; must be unique). This is what shows up in search and at '
    'GET /users/{username} once discoverability is on.',
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
    '/me/discoverability',
    tags=['Public'],
    description="Toggle whether the caller's profile/username appears in search and "
    'at GET /users/{username}. Off by default. This is the only switch: turning it '
    "off hides the profile entirely, regardless of individual logs' visibility "
    "settings — note this doesn't touch `anonymous` reviews either way, they were "
    'never attributed to the profile in the first place.',
    response_description="The caller's updated settings row.",
    responses=responses['set_discoverability'],
    operation_id='SetDiscoverability',
)
@limiter.limit(_DEFAULT_LIMIT)
async def set_discoverability(
    request: Request,
    payload: DiscoverabilityUpdate,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Any:
    return await supabase_rest.update_discoverability(
        current_user.access_token, current_user.user_id, payload.is_discoverable
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