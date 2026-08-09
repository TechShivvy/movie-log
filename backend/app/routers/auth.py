"""Auth helper endpoints for standalone/API usage.

Lets developers verify that a pasted Supabase access token is valid and see the
identity it maps to (useful in Swagger's "Authorize" flow before calling the API).
"""

from auth.supabase_auth import AuthenticatedUser, get_current_user
from fastapi import APIRouter, Depends

router = APIRouter()


@router.get('/me', tags=['Auth'])
async def me(current_user: AuthenticatedUser = Depends(get_current_user)) -> dict:
    return {'user_id': current_user.user_id, 'email': current_user.email}
