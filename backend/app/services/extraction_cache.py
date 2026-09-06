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

import hashlib
import json
from typing import Any, Optional

import httpx
from config import settings
from llm.prompts import movie_metadata as _prompts
from loguru_setup import LOGGER
from schemas.movie_metadata import MovieMetadataResult

_TIMEOUT = 10.0

# Derived from the actual prompt content *and* the response schema, not
# hand-maintained — a manually bumped version string is only as reliable
# as remembering to bump it, which already failed once in practice (a
# real prompt change shipped without the bump, serving a stale cached
# extraction that was missing the new fields until caught and fixed by
# hand). Caught live a second, different way this same session: the
# *schema* changed (fallback-tracking fields went from optional to
# required on MovieMetadataResult) while the prompt text didn't move at
# all — a stale cache entry from before that change was missing the new
# required fields entirely, and got served as-is straight into a
# FastAPI ResponseValidationError. Hashing prompts alone couldn't catch
# that; hashing the response model's own JSON schema alongside them
# means ANY future shape change — a new required field, a rename,
# whatever — also auto-invalidates old entries, no discipline required
# either way. All four prompt variants are included even though
# SYSTEM_PROMPT_TEXT/USER_PROMPT_TEXT currently derive from the other two
# (via .replace() in llm/prompts/movie_metadata.py) — hashing all of them
# is what's actually correct if that ever stops being true, at the cost
# of a few redundant bytes hashed today.
PROMPT_VERSION = hashlib.sha256(
    (
        _prompts.SYSTEM_PROMPT
        + _prompts.USER_PROMPT
        + _prompts.SYSTEM_PROMPT_TEXT
        + _prompts.USER_PROMPT_TEXT
        + json.dumps(MovieMetadataResult.model_json_schema(), sort_keys=True)
    ).encode('utf-8')
).hexdigest()[:16]


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
