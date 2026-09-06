import httpx
from config import settings
from fastapi import HTTPException, status
from loguru_setup import LOGGER
from utils.errors import APIError


async def ensure_within_daily_quota(user_id: str) -> None:
    server_key = (
        settings.supabase_secret_key.get_secret_value()
        if settings.supabase_secret_key
        else (
            settings.supabase_service_role_key.get_secret_value()
            if settings.supabase_service_role_key
            else None
        )
    )

    if not settings.supabase_url or not server_key:
        LOGGER.error(
            'Quota check misconfigured: SUPABASE_URL set={} SUPABASE_SECRET_KEY set={} SUPABASE_SERVICE_ROLE_KEY set={}',
            bool(settings.supabase_url),
            bool(settings.supabase_secret_key),
            bool(settings.supabase_service_role_key),
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail='Supabase quota settings are not configured on the backend. Set SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY).',
        )

    rpc_url = f"{settings.supabase_url.rstrip('/')}/rest/v1/rpc/increment_daily_usage"

    headers = {
        'apikey': server_key,
        'Authorization': f'Bearer {server_key}',
        'Content-Type': 'application/json',
    }
    payload = {'p_user': user_id, 'p_limit': settings.daily_free_limit}

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(rpc_url, headers=headers, json=payload)

    if response.status_code >= 400:
        LOGGER.error(
            'Quota RPC call failed: status={} body={}',
            response.status_code,
            response.text,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail='Failed to enforce daily usage limit.',
        )

    try:
        allowed = bool(response.json())
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail='Unexpected quota service response.',
        ) from exc

    if not allowed:
        raise APIError(
            status.HTTP_429_TOO_MANY_REQUESTS,
            'QUOTA_DAILY_EXCEEDED',
            'Daily free extraction limit reached. Add your own OpenRouter API key in '
            'settings or try again tomorrow.',
        )
