"""Content-addressed cache for ticket-image extraction results.

Same image bytes + same model + same prompt version always produce the
same extraction, so a repeat upload can skip the LLM call entirely. Same
privileged-RPC access pattern as services/quota.py — the backend's own
secret key, not the caller's own token, since this isn't user data, it's
an internal cost optimization with its own security-definer RPCs
(supabase/migrations/20260811000006_extraction_cache.sql), never reached
directly through a client's PostgREST token.

Deliberately fail-open throughout: any problem talking to the cache (bad
config, network hiccup, RPC error) is logged and treated as a miss/no-op
rather than raised. Caching should never be able to break the actual
extraction flow it's optimizing — worst case is just a wasted LLM call,
same as if this module didn't exist.
"""

from typing import Any, Optional

import httpx
from config import settings
from loguru_setup import LOGGER

_TIMEOUT = 10.0

# Bump whenever llm/prompts/movie_metadata.py changes materially — this is
# part of the cache key specifically so a prompt improvement naturally
# stops matching old entries instead of serving a stale extraction
# forever. No TTL/expiry needed as a result.
PROMPT_VERSION = 'v1'


def _server_key() -> Optional[str]:
    if settings.supabase_secret_key:
        return settings.supabase_secret_key.get_secret_value()
    if settings.supabase_service_role_key:
        return settings.supabase_service_role_key.get_secret_value()
    return None


async def get_cached_extraction(image_hash: str, model: str) -> Optional[dict[str, Any]]:
    key = _server_key()
    if not settings.supabase_url or not key:
        LOGGER.warning('extraction_cache: Supabase server key not configured, cache disabled')
        return None

    url = f"{settings.supabase_url.rstrip('/')}/rest/v1/rpc/get_cached_extraction"
    headers = {'apikey': key, 'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'}
    payload = {'p_hash': image_hash, 'p_model': model, 'p_prompt_version': PROMPT_VERSION}

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            response = await client.post(url, headers=headers, json=payload)
    except httpx.HTTPError as exc:
        LOGGER.warning('extraction_cache: lookup transport error, treating as miss: {}', exc)
        return None

    if response.status_code >= 400:
        LOGGER.warning(
            'extraction_cache: lookup failed status={}, treating as miss', response.status_code
        )
        return None

    try:
        data = response.json()
    except ValueError:
        return None
    return data or None


async def store_extraction(image_hash: str, model: str, metadata: dict[str, Any]) -> None:
    key = _server_key()
    if not settings.supabase_url or not key:
        return

    url = f"{settings.supabase_url.rstrip('/')}/rest/v1/rpc/upsert_extraction_cache"
    headers = {'apikey': key, 'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'}
    payload = {
        'p_hash': image_hash,
        'p_model': model,
        'p_prompt_version': PROMPT_VERSION,
        'p_metadata': metadata,
    }

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            response = await client.post(url, headers=headers, json=payload)
        if response.status_code >= 400:
            LOGGER.warning(
                'extraction_cache: store failed status={} body={}',
                response.status_code,
                response.text[:300],
            )
    except httpx.HTTPError as exc:
        LOGGER.warning('extraction_cache: store transport error (non-fatal): {}', exc)
