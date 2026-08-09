from dataclasses import dataclass
from functools import lru_cache
from uuid import UUID

import jwt
from config import settings
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import InvalidTokenError, PyJWKClient, PyJWKClientError
from loguru_setup import LOGGER

bearer_scheme = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class AuthenticatedUser:
    user_id: str
    email: str | None
    access_token: str


def _expected_issuer() -> str | None:
    if not settings.supabase_url:
        return None
    return f"{settings.supabase_url.rstrip('/')}/auth/v1"


@lru_cache(maxsize=1)
def _get_jwks_client() -> PyJWKClient:
    if not settings.supabase_url:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail='Supabase URL is not configured on the backend.',
        )

    jwks_url = f"{settings.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
    return PyJWKClient(jwks_url)


def decode_access_token(token: str) -> dict:
    legacy_secret = (
        settings.supabase_jwt_secret.get_secret_value().strip()
        if settings.supabase_jwt_secret
        else ''
    )

    issuer = _expected_issuer()

    if legacy_secret:
        try:
            return jwt.decode(
                token,
                legacy_secret,
                algorithms=['HS256'],
                audience='authenticated',
                issuer=issuer,
                options={'require': ['exp', 'sub'], 'verify_iss': bool(issuer)},
            )
        except InvalidTokenError:
            # Newer Supabase projects use asymmetric signing (JWKS).
            # If a legacy secret is set but doesn't verify, try JWKS next.
            LOGGER.warning(
                'HS256 token verification failed; attempting JWKS verification fallback.'
            )

    try:
        signing_key = _get_jwks_client().get_signing_key_from_jwt(token)
        return jwt.decode(
            token,
            signing_key.key,
            algorithms=['RS256', 'ES256', 'EdDSA'],
            audience='authenticated',
            issuer=issuer,
            options={'require': ['exp', 'sub'], 'verify_iss': bool(issuer)},
        )
    except (InvalidTokenError, PyJWKClientError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail='Invalid or expired access token.',
        ) from exc


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> AuthenticatedUser:
    # LOCAL/DEV only: if DEV_BYPASS_AUTH=true is set in .env and no token is
    # provided, return a fixed dev user so you can hit endpoints from curl/Postman
    # without needing a real Supabase JWT.
    # NEVER set this in production — the ProductionSettings class won't accept it.
    if (
        settings.env in ('LOCAL', 'DEV')
        and getattr(settings, 'dev_bypass_auth', False)
        and (not credentials)
    ):
        LOGGER.warning(
            'DEV_BYPASS_AUTH is active — using dev user. Never do this in production.'
        )
        return AuthenticatedUser(
            user_id='00000000-0000-0000-0000-000000000001',
            email='dev@localhost',
            access_token='dev-bypass',
        )

    if not credentials or credentials.scheme.lower() != 'bearer':
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail='Missing bearer token.',
        )

    payload = decode_access_token(credentials.credentials)
    user_id = payload.get('sub')
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail='Token is missing subject claim.',
        )

    try:
        UUID(user_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail='Token subject claim is not a valid UUID.',
        ) from exc

    return AuthenticatedUser(
        user_id=user_id,
        email=payload.get('email'),
        access_token=credentials.credentials,
    )
