from config import settings
from auth.supabase_auth import decode_access_token
from fastapi import HTTPException
from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request


def _user_aware_rate_limit_key(request: Request) -> str:
    auth_header = request.headers.get('authorization', '')
    if not auth_header.lower().startswith('bearer '):
        return get_remote_address(request)

    token = auth_header.split(' ', 1)[1].strip()
    if not token:
        return get_remote_address(request)

    try:
        payload = decode_access_token(token)
        subject = payload.get('sub')
        return subject or get_remote_address(request)
    except HTTPException:
        return get_remote_address(request)


limiter = Limiter(
    key_func=_user_aware_rate_limit_key, enabled=settings.rate_limit_enabled
)
