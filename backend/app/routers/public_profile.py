"""Public-facing profile search. Anonymous reads, authenticated username changes."""

from typing import Any, List

from auth.supabase_auth import AuthenticatedUser, get_current_user
from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel
from schemas.public_profile import PublicProfile, UsernameUpdate
from services import supabase_rest
from utils.errors import APIError

router = APIRouter()


@router.get('/users/search', response_model=List[PublicProfile], tags=['Public'])
async def search_users(q: str = Query(..., min_length=2)) -> Any:
    return await supabase_rest.search_public_users(q)


@router.get('/users/{username}', tags=['Public'])
async def public_profile(username: str) -> Any:
    profile = await supabase_rest.get_public_profile(username)
    if not profile:
        raise APIError(status.HTTP_404_NOT_FOUND, 'NOT_FOUND', 'User not found.')
    logs = await supabase_rest.list_public_logs_for_user(profile['user_id'])
    return {'profile': profile, 'logs': logs}


@router.patch('/me/username', tags=['Public'])
async def set_username(
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


class DiscoverabilityUpdate(BaseModel):
    is_discoverable: bool


@router.patch('/me/discoverability', tags=['Public'])
async def set_discoverability(
    payload: DiscoverabilityUpdate,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Any:
    return await supabase_rest.update_discoverability(
        current_user.access_token, current_user.user_id, payload.is_discoverable
    )