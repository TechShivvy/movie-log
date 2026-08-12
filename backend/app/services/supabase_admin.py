"""Supabase Auth Admin + Storage calls that require the service-role/secret
key — never the caller's own token. Distinct from supabase_rest.py (which is
scoped to the calling user's JWT and lets RLS do the authorization) because
these operations have no RLS equivalent: deleting an auth.users row and
bulk-deleting another user's storage objects are only possible with a
privileged key, by design. Currently used for one thing only — self-service
account deletion (routers/auth.py:delete_account) — so the surface here is
deliberately small.
"""

from typing import Any

import httpx
from config import settings
from loguru_setup import LOGGER
from utils.errors import APIError

_TIMEOUT = 15.0


def _admin_key() -> str:
    key = (
        settings.supabase_secret_key.get_secret_value()
        if settings.supabase_secret_key
        else (
            settings.supabase_service_role_key.get_secret_value()
            if settings.supabase_service_role_key
            else None
        )
    )
    if not settings.supabase_url or not key:
        raise APIError(
            500,
            'CONFIG_ERROR',
            'Supabase admin credentials are not configured on the backend. '
            'Set SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY).',
        )
    return key


def _admin_headers() -> dict[str, str]:
    key = _admin_key()
    return {'apikey': key, 'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'}


async def delete_auth_user(user_id: str) -> None:
    """Deletes the auth.users row via the Admin API. Everything this cascades
    to (user_settings, follows, blocks, venue_notes, daily_usage, reports
    filed by them) is handled by the FK actions set up in the migrations —
    see 20260813000001_account_deletion_support.sql for the one place that
    deliberately does NOT cascade (movie_logs/visit_venue_ratings — those go
    to null instead, so public content survives). A 404 here means the user
    is already gone (e.g. a retried request) — treated as success, not an
    error, so this endpoint is safely retryable.
    """
    url = f"{settings.supabase_url.rstrip('/')}/auth/v1/admin/users/{user_id}"
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            response = await client.delete(url, headers=_admin_headers())
    except httpx.HTTPError as exc:
        LOGGER.error('Admin delete_auth_user transport error: {}', exc)
        raise APIError(502, 'UPSTREAM_ERROR', 'Auth service is unavailable.') from exc

    if response.status_code == 404:
        LOGGER.warning('delete_auth_user: {} already gone, treating as success', user_id)
        return
    if response.status_code >= 400:
        LOGGER.error(
            'Admin delete_auth_user failed: status={} body={}',
            response.status_code, response.text[:500],
        )
        raise APIError(502, 'UPSTREAM_ERROR', 'Failed to delete the account.')


async def _list_storage_objects(bucket: str, prefix: str) -> list[str]:
    url = f"{settings.supabase_url.rstrip('/')}/storage/v1/object/list/{bucket}"
    payload = {'prefix': prefix, 'limit': 1000, 'offset': 0}
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        response = await client.post(url, headers=_admin_headers(), json=payload)
    if response.status_code >= 400:
        raise APIError(502, 'UPSTREAM_ERROR', 'Failed to list storage objects.')
    # The Storage list API returns names relative to `prefix`, not full
    # paths — has to be rejoined before it can be used to delete anything.
    objects: list[dict[str, Any]] = response.json()
    return [f"{prefix}/{obj['name']}" for obj in objects if obj.get('name')]


async def _delete_storage_objects(bucket: str, paths: list[str]) -> None:
    if not paths:
        return
    url = f"{settings.supabase_url.rstrip('/')}/storage/v1/object/{bucket}"
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        response = await client.request(
            'DELETE', url, headers=_admin_headers(), json={'prefixes': paths}
        )
    if response.status_code >= 400:
        raise APIError(502, 'UPSTREAM_ERROR', 'Failed to delete storage objects.')


async def delete_user_storage(user_id: str) -> None:
    """Best-effort cleanup of everything this user owns in the avatar-images
    and ticket-images buckets — objects live under a `{user_id}/` prefix in
    both (see the storage RLS policies in migrations 20260709000001 and
    20260811000011), so this is a straight list-then-bulk-delete per bucket.
    ticket_image_path is never surfaced publicly regardless of a log's
    visibility (see public_movie_log_entries), so it's safe to wipe every
    ticket image unconditionally here even though some of the owning
    movie_logs rows themselves survive deletion. Deliberately swallows
    failures rather than raising: a storage hiccup shouldn't block the
    account deletion itself — the objects are already unreachable garbage
    once the owning user_id can never again match `auth.uid()` in the
    write-side RLS policy, they just sit there wasting space instead of
    being reclaimed immediately.
    """
    for bucket in ('avatar-images', 'ticket-images'):
        try:
            paths = await _list_storage_objects(bucket, user_id)
            await _delete_storage_objects(bucket, paths)
        except APIError as exc:
            LOGGER.warning(
                'delete_user_storage: cleanup failed for bucket={} user={}: {}',
                bucket, user_id, exc.message,
            )
