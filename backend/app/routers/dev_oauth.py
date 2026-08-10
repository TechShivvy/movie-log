"""LOCAL/DEV-only shim so Swagger's generic OAuth2 "Authorize" button can
drive Supabase's Google sign-in, which doesn't speak generic OAuth2.

Swagger UI's authorizationCode flow (with PKCE) expects:
  - GET  <authorizationUrl>?response_type=code&redirect_uri=...&client_id=...
         &state=...&code_challenge=...&code_challenge_method=...
  - POST <tokenUrl> (form-encoded) grant_type=authorization_code&code=...
         &redirect_uri=...&code_verifier=...&client_id=...

Supabase's actual endpoints expect:
  - GET  {SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=...
         &flow_type=pkce&code_challenge=...&code_challenge_method=...
  - POST {SUPABASE_URL}/auth/v1/token?grant_type=pkce  (JSON body)
         {"auth_code": "...", "code_verifier": "..."}

These three routes translate one shape into the other:
  1. /dev/google/authorize — repackages Swagger's request as a Supabase
     authorize redirect (provider=google, flow_type=pkce). The PKCE
     code_challenge Swagger generated passes straight through unchanged;
     Supabase just needs to see the same value at both ends.
  2. /dev/google/callback — where Supabase sends the browser back to after
     Google login completes. Hands the resulting `code` off to Swagger's
     own redirect_uri, exactly as if this app were the authorization
     server (Swagger doesn't know or care that the code actually
     originated from Supabase).
  3. /dev/google/token — receives Swagger's form-encoded token request,
     replays it to Supabase's JSON PKCE token endpoint, relays the result
     back in the shape Swagger expects.

Registered only when ENV is LOCAL/DEV (see app.py) — never reachable in
PROD, where /docs itself is also disabled. `_guard_dev_only` re-checks this
inside each handler too, in case that registration guard is ever changed
without noticing this file depends on it.
"""

from urllib.parse import urlencode

import httpx
from config import settings
from fastapi import APIRouter, Form, HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse
from loguru_setup import LOGGER

router = APIRouter()

_CALLBACK_PATH = f'{settings.api_prefix}/auth/dev/google/callback'


def _guard_dev_only() -> None:
    if settings.env not in ('LOCAL', 'DEV'):
        raise HTTPException(status_code=404, detail='Not found.')


@router.get('/dev/google/authorize', include_in_schema=False)
async def dev_google_authorize(request: Request) -> RedirectResponse:
    _guard_dev_only()
    if not settings.supabase_url:
        raise HTTPException(500, 'SUPABASE_URL is not configured on the backend.')

    q = request.query_params
    redirect_uri = q.get('redirect_uri')
    if not redirect_uri:
        raise HTTPException(400, 'Missing redirect_uri (expected from Swagger UI).')

    # Everything Supabase's own redirect needs to hand back to us at
    # /callback below — Supabase appends its own `code` param on top of
    # whatever query string redirect_to already has, it doesn't strip it.
    callback_url = str(request.base_url).rstrip('/') + _CALLBACK_PATH
    redirect_to = (
        f'{callback_url}?'
        + urlencode({'swagger_redirect_uri': redirect_uri, 'swagger_state': q.get('state', '')})
    )

    params = {'provider': 'google', 'redirect_to': redirect_to, 'flow_type': 'pkce'}
    if q.get('code_challenge'):
        params['code_challenge'] = q['code_challenge']
        params['code_challenge_method'] = q.get('code_challenge_method', 'S256')
    else:
        LOGGER.warning(
            'dev_google_authorize: no code_challenge from Swagger — enable "PKCE" '
            'in the Authorize dialog, or the token exchange will fail.'
        )

    authorize_url = f"{settings.supabase_url.rstrip('/')}/auth/v1/authorize?{urlencode(params)}"
    LOGGER.debug('dev_google_authorize: redirecting to Supabase -> Google')
    return RedirectResponse(authorize_url)


@router.get('/dev/google/callback', include_in_schema=False)
async def dev_google_callback(request: Request) -> RedirectResponse:
    _guard_dev_only()
    q = request.query_params
    code = q.get('code')
    swagger_redirect_uri = q.get('swagger_redirect_uri')
    if not code or not swagger_redirect_uri:
        LOGGER.error('dev_google_callback: unexpected callback params: {}', dict(q))
        raise HTTPException(
            400,
            f"Google/Supabase sign-in didn't return the expected params: {dict(q)}",
        )

    params = {'code': code}
    if q.get('swagger_state'):
        params['state'] = q['swagger_state']
    return RedirectResponse(f'{swagger_redirect_uri}?{urlencode(params)}')


@router.post('/dev/google/token', include_in_schema=False)
async def dev_google_token(
    code: str = Form(...),
    code_verifier: str = Form(default=''),
) -> JSONResponse:
    _guard_dev_only()
    if not settings.supabase_url or not settings.supabase_publishable_key:
        raise HTTPException(500, 'Supabase is not configured on the backend.')

    apikey = settings.supabase_publishable_key.get_secret_value()
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(
            f"{settings.supabase_url.rstrip('/')}/auth/v1/token?grant_type=pkce",
            headers={'apikey': apikey, 'Content-Type': 'application/json'},
            json={'auth_code': code, 'code_verifier': code_verifier},
        )

    if response.status_code >= 400:
        LOGGER.error('dev_google_token: Supabase token exchange failed: {}', response.text[:500])
        raise HTTPException(400, f'Token exchange with Supabase failed: {response.text[:300]}')

    session = response.json()
    if 'access_token' not in session:
        raise HTTPException(502, 'Supabase token exchange returned an unexpected response.')

    LOGGER.info('dev_google_token: exchanged Google/Supabase code for a session')
    return JSONResponse(
        {
            'access_token': session['access_token'],
            'token_type': session.get('token_type', 'bearer'),
            'expires_in': session.get('expires_in'),
            'refresh_token': session.get('refresh_token'),
        }
    )
