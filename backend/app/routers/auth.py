"""Auth helper endpoints for standalone/API usage.

Lets developers verify that a pasted Supabase access token is valid and see the
identity it maps to (useful in Swagger's "Authorize" flow before calling the API).
"""

from auth.supabase_auth import AuthenticatedUser, get_current_user
from fastapi import APIRouter, Depends
from responses.auth import responses

router = APIRouter()


@router.get(
    '/me',
    tags=['Auth'],
    description='Verify a Supabase access token and see the identity it maps to.',
    response_description='The identity mapped from the access token.',
    responses=responses['me'],
    operation_id='WhoAmI',
)
async def me(current_user: AuthenticatedUser = Depends(get_current_user)) -> dict:
    return {'user_id': current_user.user_id, 'email': current_user.email}
