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


limiter = Limiter(key_func=_user_aware_rate_limit_key, enabled=settings.rate_limit_enabled)

# NOTE on why every route below carries its own @limiter.limit(...) instead of
# relying on Limiter(default_limits=[...]): tried that first. It doesn't
# work — slowapi 0.1.9's SlowAPIMiddleware only invokes a rate check for
# routes it finds in limiter._route_limits (i.e. routes that already have
# their own @limiter.limit decorator); everything else is treated as
# _should_exempt and the middleware skips it entirely, silently, no matter
# what default_limits was set to. Confirmed live: 70 rapid requests to an
# undecorated route all returned 200 with default_limits configured.
# settings.default_rate_limit_per_minute (60/minute) is instead applied via
# an explicit @limiter.limit(f'{settings.default_rate_limit_per_minute}/minute')
# on every route that used to have none at all — previously only /extract,
# create_log, and import_logs had any limit, including on the fully public,
# unauthenticated endpoints (theatre/screen stats, user search, public
# profiles). root.py's / and /health are @limiter.exempt instead, since
# health checks are meant to be polled frequently by load balancers.
