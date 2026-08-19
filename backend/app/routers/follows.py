"""Follow relationships and blocking. Mounted at the same {api_prefix}/public
prefix as public_profile.py (split into its own file the same way
movie_logs.py/venues.py are), since these are a genuinely separate set of
endpoints from profile search/settings.
"""

from typing import Annotated, Any, Optional

from auth.supabase_auth import AuthenticatedUser, get_current_user, get_current_user_optional
from config import settings
from fastapi import APIRouter, Depends, Query, Request, status
from rate_limit import limiter
from responses.follows import responses
from services import supabase_rest
from utils.errors import APIError

router = APIRouter()

_DEFAULT_LIMIT = f'{settings.default_rate_limit_per_minute}/minute'


async def _resolve_user(username: str, viewer_token: Optional[str]) -> dict:
    # Always resolved with the caller's own token now (Phase 4) so
    # is_blocked/can_view_content reflect the caller's actual relationship
    # to this user, not an anonymous view of them.
    profile = await supabase_rest.get_public_profile(username, viewer_token=viewer_token)
    if not profile:
        raise APIError(status.HTTP_404_NOT_FOUND, 'NOT_FOUND', 'User not found.')
    return profile


@router.post(
    '/follows/{username}',
    tags=['Follows'],
    description='Follow a user. Instant (`status: accepted`) if their account is '
    '`public`; otherwise creates a `pending` request they must accept (see '
    'POST .../accept). A `private` account still accepts a follow request — it '
    "just doesn't unlock any content on its own; see AccountPrivacyUpdate for "
    'why. 403 BLOCKED if either side has blocked the other.',
    response_description='The created (or existing) follow relationship.',
    responses=responses['create_follow'],
    operation_id='FollowUser',
)
@limiter.limit(_DEFAULT_LIMIT)
async def follow_user(
    request: Request,
    username: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Any:
    target = await _resolve_user(username, current_user.access_token)
    if target['user_id'] == current_user.user_id:
        raise APIError(status.HTTP_400_BAD_REQUEST, 'SELF_FOLLOW', 'Cannot follow yourself.')

    if target['is_blocked']:
        # target['is_blocked'] (Phase 4's get_public_profile_by_username)
        # covers either direction but doesn't say which — is_blocking
        # (checkable directly, since blocks are readable by their own
        # blocker) disambiguates for a clearer message. Superseded the
        # Phase 2 version of this check, which had to infer "they blocked
        # me" from a failed insert since that information didn't exist yet.
        if await supabase_rest.is_blocking(current_user.access_token, current_user.user_id, target['user_id']):
            raise APIError(status.HTTP_403_FORBIDDEN, 'BLOCKED', 'You have blocked this user.')
        raise APIError(status.HTTP_403_FORBIDDEN, 'BLOCKED', 'You have been blocked by this user.')

    existing = await supabase_rest.get_follow(
        current_user.access_token, current_user.user_id, target['user_id']
    )
    if existing:
        raise APIError(status.HTTP_409_CONFLICT, 'ALREADY_FOLLOWING', 'Already following this user.')

    follow_status = 'accepted' if target['account_visibility'] == 'public' else 'pending'
    try:
        return await supabase_rest.create_follow(
            current_user.access_token, current_user.user_id, target['user_id'], follow_status
        )
    except APIError as e:
        if e.status_code == 400:
            # Every real cause is ruled out above by now — this is just a
            # defensive net for a race condition between the checks above
            # and this insert (e.g. two concurrent follow requests), not a
            # code path expected to trigger in normal use.
            raise APIError(status.HTTP_409_CONFLICT, 'FOLLOW_CONFLICT', 'Could not complete follow — try again.')
        raise


@router.delete(
    '/follows/{username}',
    tags=['Follows'],
    description="Unfollow — deletes the caller's outgoing follow/request. Works "
    'whether it was pending or accepted (cancels a pending request too).',
    response_description='No content.',
    responses=responses['delete_follow'],
    operation_id='UnfollowUser',
)
@limiter.limit(_DEFAULT_LIMIT)
async def unfollow_user(
    request: Request,
    username: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Any:
    target = await _resolve_user(username, current_user.access_token)
    deleted = await supabase_rest.delete_follow(
        current_user.access_token, current_user.user_id, target['user_id']
    )
    if not deleted:
        raise APIError(status.HTTP_404_NOT_FOUND, 'NOT_FOUND', 'Not following this user.')
    return {'status': 'unfollowed'}


@router.post(
    '/follows/{username}/accept',
    tags=['Follows'],
    description='Accept a pending follow request from `username` (caller must be '
    'the followee).',
    response_description='The now-accepted follow relationship.',
    responses=responses['accept_follow'],
    operation_id='AcceptFollowRequest',
)
@limiter.limit(_DEFAULT_LIMIT)
async def accept_follow_request(
    request: Request,
    username: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Any:
    follower = await _resolve_user(username, current_user.access_token)
    accepted = await supabase_rest.accept_follow(
        current_user.access_token, follower['user_id'], current_user.user_id
    )
    if not accepted:
        raise APIError(status.HTTP_404_NOT_FOUND, 'NOT_FOUND', 'No pending follow request from this user.')
    return accepted


@router.delete(
    '/follows/followers/{username}',
    tags=['Follows'],
    description='Remove `username` as a follower, or reject their pending request '
    '(caller must be the followee) — same delete either way.',
    response_description='No content.',
    responses=responses['remove_follower'],
    operation_id='RemoveFollower',
)
@limiter.limit(_DEFAULT_LIMIT)
async def remove_follower(
    request: Request,
    username: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Any:
    follower = await _resolve_user(username, current_user.access_token)
    deleted = await supabase_rest.delete_follower(
        current_user.access_token, follower['user_id'], current_user.user_id
    )
    if not deleted:
        raise APIError(status.HTTP_404_NOT_FOUND, 'NOT_FOUND', 'Not a follower or pending requester.')
    return {'status': 'removed'}


@router.get(
    '/follow-requests',
    tags=['Follows'],
    description="The caller's own pending incoming follow requests (raw "
    'follower_id/followee_id rows — resolve usernames via GET /users/search or '
    'a stored username cache client-side, no join is done here).',
    response_description='Pending requests, newest first.',
    responses=responses['list_follow_requests'],
    operation_id='ListFollowRequests',
)
@limiter.limit(_DEFAULT_LIMIT)
async def list_follow_requests(
    request: Request,
    current_user: AuthenticatedUser = Depends(get_current_user),
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> Any:
    return await supabase_rest.list_follow_requests(
        current_user.access_token, current_user.user_id, limit=limit, offset=offset
    )


@router.get(
    '/users/{username}/followers',
    tags=['Follows'],
    description="A user's accepted followers — gated the same way their profile "
    "content is: visible to anyone if the account is public, only to accepted "
    "followers (+ owner) if followers_only, to nobody but the owner if private. "
    "404s if the caller and this user have blocked each other, same as the "
    'profile route. Public — no sign-in required, but sending a token lets the '
    "response reflect the caller's own follow access.",
    response_description="The user's followers, most recently followed first.",
    responses=responses['list_followers'],
    operation_id='ListFollowers',
)
@limiter.limit(_DEFAULT_LIMIT)
async def list_followers(
    request: Request,
    username: str,
    current_user: Optional[AuthenticatedUser] = Depends(get_current_user_optional),
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> Any:
    viewer_token = current_user.access_token if current_user else None
    target = await _resolve_user(username, viewer_token)
    if target['is_blocked']:
        raise APIError(status.HTTP_404_NOT_FOUND, 'NOT_FOUND', 'User not found.')
    return await supabase_rest.list_followers(username, limit=limit, offset=offset, viewer_token=viewer_token)


@router.get(
    '/users/{username}/following',
    tags=['Follows'],
    description="Who a user follows (accepted only) — same visibility gating and "
    'block-404 behavior as GET .../followers.',
    response_description="Who the user follows, most recently followed first.",
    responses=responses['list_following'],
    operation_id='ListFollowing',
)
@limiter.limit(_DEFAULT_LIMIT)
async def list_following(
    request: Request,
    username: str,
    current_user: Optional[AuthenticatedUser] = Depends(get_current_user_optional),
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> Any:
    viewer_token = current_user.access_token if current_user else None
    target = await _resolve_user(username, viewer_token)
    if target['is_blocked']:
        raise APIError(status.HTTP_404_NOT_FOUND, 'NOT_FOUND', 'User not found.')
    return await supabase_rest.list_following(username, limit=limit, offset=offset, viewer_token=viewer_token)


@router.post(
    '/blocks/{username}',
    tags=['Follows'],
    description='Block a user. Severs any existing follow relationship in either '
    'direction and prevents new ones. Also excludes them from GET /users/search '
    'results, in both directions.',
    response_description='Confirmation.',
    responses=responses['create_block'],
    operation_id='BlockUser',
)
@limiter.limit(_DEFAULT_LIMIT)
async def block_user(
    request: Request,
    username: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Any:
    target = await _resolve_user(username, current_user.access_token)
    if target['user_id'] == current_user.user_id:
        raise APIError(status.HTTP_400_BAD_REQUEST, 'SELF_BLOCK', 'Cannot block yourself.')
    try:
        await supabase_rest.create_block(current_user.access_token, current_user.user_id, target['user_id'])
    except APIError as e:
        if e.status_code == 400:
            raise APIError(status.HTTP_409_CONFLICT, 'ALREADY_BLOCKED', 'Already blocked.')
        raise
    return {'status': 'blocked'}


@router.get(
    '/feed',
    tags=['Follows'],
    description="Reverse-chronological feed of accounts the caller follows "
    "(status: accepted only) — every entry set to `visibility: public` from "
    "each followed account's own logs (never `anonymous`/`private` ones; the "
    "account-level visibility tier is an additional gate on top of that, via "
    "can_view_user_content — see migration 20260811000012). Never includes "
    "the caller's own logs. Optional `movie_id`/`theatre_id`/`screen_id` "
    'narrow this to entries about one movie/venue — same eq-only filter shape '
    'as GET /movie-logs\'s own theatre_id/screen_id/movie_id, applied on top of '
    'the gating above, not a replacement for it. Requires sign-in — there\'s no '
    'anonymous variant.',
    response_description="The caller's feed, newest watched_date first.",
    responses=responses['list_feed'],
    operation_id='GetFeed',
)
@limiter.limit(_DEFAULT_LIMIT)
async def get_feed(
    request: Request,
    current_user: AuthenticatedUser = Depends(get_current_user),
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
    movie_id: Annotated[str | None, Query()] = None,
    theatre_id: Annotated[str | None, Query()] = None,
    screen_id: Annotated[str | None, Query()] = None,
) -> Any:
    return await supabase_rest.list_feed(
        current_user.access_token,
        limit=limit,
        offset=offset,
        movie_id=movie_id,
        theatre_id=theatre_id,
        screen_id=screen_id,
    )


@router.delete(
    '/blocks/{username}',
    tags=['Follows'],
    description='Unblock a user.',
    response_description='No content.',
    responses=responses['delete_block'],
    operation_id='UnblockUser',
)
@limiter.limit(_DEFAULT_LIMIT)
async def unblock_user(
    request: Request,
    username: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Any:
    target = await _resolve_user(username, current_user.access_token)
    deleted = await supabase_rest.delete_block(current_user.access_token, current_user.user_id, target['user_id'])
    if not deleted:
        raise APIError(status.HTTP_404_NOT_FOUND, 'NOT_FOUND', 'Not blocked.')
    return {'status': 'unblocked'}
