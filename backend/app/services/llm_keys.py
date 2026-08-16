"""Encrypted server-side storage for a user's own OpenAI/Gemini/OpenRouter
API key (supabase/migrations/20260813000026_user_llm_keys.sql). Same
privileged-RPC access pattern as services/quota.py and
services/extraction_cache.py — the backend's own secret key, not the
caller's own token, since user_llm_keys has zero PostgREST grants at all
(not even to its own owner) by design. Encryption/decryption happens
here, in the app layer, via utils/crypto.py — Postgres never sees a
plaintext key.
"""

from typing import Any, Optional

import httpx
from config import settings
from fastapi import HTTPException, status
from loguru_setup import LOGGER
from utils import crypto

_TIMEOUT = 10.0


def _server_key() -> Optional[str]:
    if settings.supabase_secret_key:
        return settings.supabase_secret_key.get_secret_value()
    if settings.supabase_service_role_key:
        return settings.supabase_service_role_key.get_secret_value()
    return None


def _headers(key: str) -> dict[str, str]:
    return {'apikey': key, 'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'}


def _rest_url(path: str) -> str:
    if not settings.supabase_url:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail='Supabase is not configured on the backend.',
        )
    return f"{settings.supabase_url.rstrip('/')}/rest/v1{path}"


def _require_server_key() -> str:
    key = _server_key()
    if not key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail='Supabase server key is not configured on the backend. Set '
            'SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY).',
        )
    return key


def _mask(row: dict[str, Any]) -> dict[str, Any]:
    return {
        'provider': row['provider'],
        'key_prefix': row['key_prefix'],
        'created_at': row.get('created_at'),
        'updated_at': row.get('updated_at'),
    }


async def store_llm_key(user_id: str, provider: str, api_key: str) -> dict[str, Any]:
    """Encrypts and upserts — callers should validate the key live (e.g.
    via llm.llm_client.check_api_key) before calling this, so a garbage
    key isn't stored and only discovered broken on the next real extract
    call."""

    key = _require_server_key()
    row = {
        'user_id': user_id,
        'provider': provider,
        'encrypted_key': crypto.encrypt(api_key),
        'key_prefix': crypto.mask_prefix(api_key),
    }
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        response = await client.post(
            _rest_url('/user_llm_keys'),
            headers={**_headers(key), 'Prefer': 'resolution=merge-duplicates,return=representation'},
            params={'on_conflict': 'user_id,provider'},
            json=row,
        )
    if response.status_code >= 400:
        LOGGER.error('llm_keys: store failed status={} body={}', response.status_code, response.text[:300])
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail='Failed to store the API key.',
        )
    rows = response.json()
    return _mask(rows[0]) if rows else {}


async def list_llm_keys(user_id: str) -> list[dict[str, Any]]:
    key = _require_server_key()
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        response = await client.get(
            _rest_url('/user_llm_keys'),
            headers=_headers(key),
            params={'user_id': f'eq.{user_id}', 'select': '*', 'order': 'provider.asc'},
        )
    if response.status_code >= 400:
        LOGGER.error('llm_keys: list failed status={} body={}', response.status_code, response.text[:300])
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail='Failed to read stored API keys.',
        )
    return [_mask(row) for row in response.json()]


async def delete_llm_key(user_id: str, provider: str) -> bool:
    key = _require_server_key()
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        response = await client.delete(
            _rest_url('/user_llm_keys'),
            headers={**_headers(key), 'Prefer': 'return=representation'},
            params={'user_id': f'eq.{user_id}', 'provider': f'eq.{provider}'},
        )
    if response.status_code >= 400:
        LOGGER.error('llm_keys: delete failed status={} body={}', response.status_code, response.text[:300])
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail='Failed to delete the stored API key.',
        )
    return bool(response.json())


async def get_decrypted_llm_key(user_id: str, provider: str) -> Optional[str]:
    """Backend-only — the one place a stored key is ever turned back into
    plaintext, immediately before using it to call the provider. Never
    returned from any endpoint."""

    key = _require_server_key()
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        response = await client.get(
            _rest_url('/user_llm_keys'),
            headers=_headers(key),
            params={
                'user_id': f'eq.{user_id}', 'provider': f'eq.{provider}',
                'select': 'encrypted_key', 'limit': '1',
            },
        )
    if response.status_code >= 400:
        LOGGER.error('llm_keys: get failed status={} body={}', response.status_code, response.text[:300])
        return None
    rows = response.json()
    if not rows:
        return None
    return crypto.decrypt(rows[0]['encrypted_key'])
