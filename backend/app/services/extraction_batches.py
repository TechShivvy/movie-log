"""Background execution for POST /movie-metadata/extract-batch
(routers/movie_metadata_batch.py). This app has no Celery/Redis/task
queue at all (see backend/scripts/docker-entry.sh's gunicorn config: 4
UvicornWorker processes, --preload, --timeout 60) — a batch runs as a
plain asyncio background task on whichever worker received the creating
request, and lives only in that worker's own event loop. Every read a
poller might make has to come from Postgres, never from memory, since a
GET .../extract-batch/{id} can land on any of the 4 workers.

Privileged-service-role-key access pattern throughout, same shape as
services/quota.py and services/llm_keys.py — this table's RLS
(extraction_batches_select_own) only ever grants `select`, every write
here goes through the backend's own key, never the caller's token, since
the background task must not depend on a JWT staying valid for the
batch's whole runtime (a real, accepted risk — see run_batch's own
docstring on what happens if it outlives the token anyway).
"""

import asyncio
import time
from typing import Any, Optional

import httpx
from config import settings
from loguru_setup import LOGGER
from openai import OpenAIError
from pydantic import ValidationError
from schemas.movie_metadata import MovieMetadata, MovieMetadataResult
from services import auto_insert as auto_insert_service
from services import extraction_cache
from services.quota import ensure_within_daily_quota
from utils import image
from utils.errors import APIError
from utils.openai_utils import openai_error_to_http

_TIMEOUT = 15.0

# Held so asyncio.create_task's result isn't garbage-collected mid-run —
# a bare `asyncio.create_task(...)` with nothing holding a reference to
# it can be collected before it finishes, silently killing the batch. A
# plain module-level set, safe under gunicorn's --preload+fork: nothing
# here is bound to a live event loop until a task is actually added,
# which only ever happens inside a request handler, after fork, inside
# that worker's own running loop.
_RUNNING_TASKS: set[asyncio.Task] = set()


def track_task(task: asyncio.Task) -> None:
    """Registers a run_batch task with _RUNNING_TASKS above (held so it
    isn't garbage-collected mid-run) and arranges for it to be discarded
    once done. Called by routers/movie_metadata_batch.py right after
    asyncio.create_task(run_batch(...)) — kept as a function here rather
    than having the router reach into the module-private set directly."""

    _RUNNING_TASKS.add(task)
    task.add_done_callback(_RUNNING_TASKS.discard)

# (max_concurrent, min_interval_between_starts_seconds) — third-party
# facts about each provider's real rate limits, not a business/ops dial,
# so these are plain constants rather than Settings fields (unlike
# max_batch_size/batch_create_rate_limit_per_minute/batch_stale_after_minutes,
# which genuinely are ops decisions and live in config.yaml). Gemini's
# free tier is ~5 RPM (already documented on /extract's own docstring)
# -> effectively serialized, 12s floor between calls. OpenRouter/OpenAI
# get real overlap — bounded concurrency hides per-call latency — while
# the pacing floor still caps how fast *new* calls can start, so a burst
# can never exceed it regardless of concurrency.
_PACING_BY_PROVIDER: dict[str, tuple[int, float]] = {
    'gemini': (1, 12.0),
    'openrouter': (3, 2.0),
    'openai': (3, 1.0),
}
_DEFAULT_PACING = (2, 3.0)


def _server_key() -> str:
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
            500, 'CONFIG_ERROR',
            'Supabase admin credentials are not configured on the backend.',
        )
    return key


def _headers() -> dict[str, str]:
    key = _server_key()
    return {'apikey': key, 'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'}


async def _rest(
    method: str, path: str, *, params: Optional[dict[str, Any]] = None,
    json: Any = None, prefer: Optional[str] = None,
) -> httpx.Response:
    headers = _headers()
    if prefer:
        headers['Prefer'] = prefer
    url = f"{settings.supabase_url.rstrip('/')}/rest/v1{path}"
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        response = await client.request(method, url, headers=headers, params=params, json=json)
    if response.status_code >= 400:
        LOGGER.error(
            'extraction_batches: {} {} failed status={} body={}',
            method, path, response.status_code, response.text[:500],
        )
    return response


async def create_batch(
    *,
    user_id: str,
    provider: str,
    model: str,
    auto_fallback: bool,
    auto_insert: bool,
    items: list[tuple[str, bytes, str]],
) -> tuple[dict[str, Any], list[str]]:
    """items: list of (filename, content, content_type). Returns
    (the created extraction_batches row, item ids in the same order as
    `items` — position 0..n-1). Item rows are created 'queued'; run_batch
    below is what actually processes them, matched back to `items` by
    the item-id list this returns, not by re-querying the table (avoids
    a second round trip and any doubt about PostgREST's return-order
    guarantees — explicitly sorted by position here regardless)."""

    batch_resp = await _rest(
        'POST', '/extraction_batches',
        json={
            'user_id': user_id, 'provider': provider, 'model': model,
            'auto_fallback': auto_fallback, 'auto_insert': auto_insert,
            'total_items': len(items),
        },
        prefer='return=representation',
    )
    batch_rows = batch_resp.json()
    if not batch_rows:
        raise APIError(502, 'UPSTREAM_ERROR', 'Failed to create the extraction batch.')
    batch = batch_rows[0]

    item_payload = [
        {'batch_id': batch['id'], 'position': i, 'filename': filename}
        for i, (filename, _content, _content_type) in enumerate(items)
    ]
    items_resp = await _rest(
        'POST', '/extraction_batch_items', json=item_payload, prefer='return=representation',
    )
    created_items = items_resp.json()
    if len(created_items) != len(items):
        raise APIError(502, 'UPSTREAM_ERROR', 'Failed to create the extraction batch items.')
    created_items.sort(key=lambda row: row['position'])
    item_ids = [row['id'] for row in created_items]
    return batch, item_ids


async def _update_item(item_id: str, **fields: Any) -> None:
    # updated_at bumps automatically — trg_extraction_batch_items_updated_at
    # (20260817000003_extraction_batch_items_updated_at_trigger.sql), same
    # set_updated_at_timestamp() trigger every other table in this schema uses.
    await _rest(
        'PATCH', '/extraction_batch_items', params={'id': f'eq.{item_id}'},
        json=fields, prefer='return=minimal',
    )


async def _touch_batch(batch_id: str) -> None:
    await _rest(
        'PATCH', '/extraction_batches', params={'id': f'eq.{batch_id}'},
        json={'last_progress_at': _now_iso()}, prefer='return=minimal',
    )


async def _record_item_progress(batch_id: str, *, success: bool) -> None:
    # Atomic single-statement increment (increment_batch_progress RPC,
    # 20260817000005_batch_progress_rpc.sql) — items are processed under
    # bounded concurrency (asyncio.Semaphore in run_batch), so a plain
    # Python read-modify-write PATCH here would race and undercount
    # whenever two items finish close together. Same reasoning
    # services/quota.py's increment_daily_usage already established.
    await _rest(
        'POST', '/rpc/increment_batch_progress',
        json={'p_batch_id': batch_id, 'p_success': success},
    )


async def _update_batch(batch_id: str, **fields: Any) -> None:
    await _rest(
        'PATCH', '/extraction_batches', params={'id': f'eq.{batch_id}'},
        json=fields, prefer='return=minimal',
    )


async def mark_stale(batch_id: str) -> None:
    """Conditional on status still being 'processing' — safe under a
    concurrent poller/a genuinely-still-running task racing this, since
    only the first writer's PATCH actually matches any rows."""

    await _rest(
        'PATCH', '/extraction_batches',
        params={'id': f'eq.{batch_id}', 'status': 'eq.processing'},
        json={
            'status': 'failed', 'error_code': 'STALLED',
            'error_message': 'No progress for over the configured staleness window — the '
            'worker processing this batch may have restarted (a deploy or a crash). This '
            'batch will not resume; submit a new one for anything left unprocessed.',
            'finished_at': _now_iso(),
        },
        prefer='return=minimal',
    )


def _now_iso() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()


async def run_batch(
    *,
    batch_id: str,
    item_ids: list[str],
    items: list[tuple[str, bytes, str]],
    user_id: str,
    user_token: str,
    llm_api_key: str,
    provider: str,
    model: str,
    auto_fallback: bool,
    auto_insert: bool,
    is_shared_key_path: bool,
) -> None:
    """The background task itself — created via asyncio.create_task by
    routers/movie_metadata_batch.py right after create_batch(), held in
    _RUNNING_TASKS. Never re-raises: one bad item fails that item and
    moves on, an unexpected bug anywhere in the loop is caught by the
    outer try/except and flips the whole batch to 'failed' rather than
    leaving it stuck 'processing' forever with a client-visible error to
    show for it.

    What this can't protect against: the *worker process itself* dying
    (a PROD redeploy restarting all 4 workers, a crash/OOM) — neither
    lets this function's own except clause run, the task is simply gone.
    GET .../extract-batch/{id}'s staleness check (mark_stale above) is
    the sole backstop for that case, bounding it to a client-visible
    failure within settings.batch_stale_after_minutes of the last item
    update, not a recovery of the lost work.

    llm_api_key is captured once at batch-creation time and reused for
    every item — a long/heavily-retried batch could in principle outlive
    a real user access token's validity (~1hr typical); any remaining
    auto-inserts would then fail individually (auto_insert_status=
    'failed') without aborting the batch. No refresh mechanism here —
    accepted for v1."""

    from llm.llm_client import extract_movie_metadata_from_image
    from llm.prompts import movie_metadata as movie_metadata_prompts

    max_concurrent, min_interval = _PACING_BY_PROVIDER.get(provider, _DEFAULT_PACING)
    semaphore = asyncio.Semaphore(max_concurrent)
    pacing_lock = asyncio.Lock()
    last_call_at = [0.0]

    async def _wait_for_pacing_slot() -> None:
        async with pacing_lock:
            now = time.monotonic()
            wait = last_call_at[0] + min_interval - now
            if wait > 0:
                await asyncio.sleep(wait)
            last_call_at[0] = time.monotonic()

    async def _process_one(item_id: str, content: bytes, content_type: str) -> None:
        async with semaphore:
            success = False
            try:
                image_hash = image.hash_bytes(content)
                cached = await extraction_cache.get_cached_extraction(image_hash, f'{provider}:{model}')
                if cached is not None:
                    result = cached
                else:
                    await _wait_for_pacing_slot()
                    if is_shared_key_path:
                        await ensure_within_daily_quota(user_id)
                    image_data_uri = image.bytes_to_data_uri(content, content_type)
                    ticket, used_model = await extract_movie_metadata_from_image(
                        image_data_uri=image_data_uri,
                        api_key=llm_api_key,
                        system_prompt=movie_metadata_prompts.SYSTEM_PROMPT,
                        user_prompt=movie_metadata_prompts.USER_PROMPT,
                        response_model=MovieMetadata,
                        model_name=model,
                        provider=provider,
                        auto_fallback=auto_fallback,
                    )
                    final = MovieMetadataResult(
                        **ticket.model_dump(),
                        used_provider=provider,
                        used_model=used_model,
                        requested_model=model,
                        fallback_occurred=used_model != model,
                    )
                    result = final.model_dump()
                    await extraction_cache.store_extraction(image_hash, f'{provider}:{model}', result)

                item_fields: dict[str, Any] = {
                    'status': 'completed',
                    'image_hash': image_hash,
                    'result': result,
                    'used_provider': result['used_provider'],
                    'used_model': result['used_model'],
                    'requested_model': result['requested_model'],
                    'fallback_occurred': result['fallback_occurred'],
                }

                if auto_insert:
                    metadata = MovieMetadata(**{k: result.get(k) for k in MovieMetadata.model_fields})
                    status_, log_id = await auto_insert_service.auto_insert_log(
                        user_id=user_id, user_token=user_token, metadata=metadata,
                        content=content, content_type=content_type,
                        extraction_provider=result['used_provider'], extraction_model=result['used_model'],
                        extraction_batch_id=batch_id,
                    )
                    item_fields['auto_insert_status'] = status_
                    item_fields['movie_log_id'] = log_id

                await _update_item(item_id, **item_fields)
                success = True
            except ValidationError as exc:
                LOGGER.error('extraction_batches: item {} validation error: {}', item_id, exc)
                await _update_item(
                    item_id, status='failed', error_code='VALIDATION_ERROR',
                    error_message='Failed to parse movie metadata from the model response.',
                )
            except OpenAIError as exc:
                http_exc = openai_error_to_http(exc)
                await _update_item(
                    item_id, status='failed', error_code=str(http_exc.status_code),
                    error_message=str(http_exc.detail),
                )
            except APIError as exc:
                await _update_item(item_id, status='failed', error_code=exc.code, error_message=exc.message)
            except Exception as exc:
                LOGGER.error('extraction_batches: item {} unexpected error: {}', item_id, exc)
                await _update_item(
                    item_id, status='failed', error_code='INTERNAL_ERROR', error_message=str(exc)[:500],
                )
            finally:
                await _record_item_progress(batch_id, success=success)
                await _touch_batch(batch_id)

    try:
        await asyncio.gather(*(
            _process_one(item_id, content, content_type)
            for item_id, (_filename, content, content_type) in zip(item_ids, items)
        ))
        await _update_batch(batch_id, status='completed', finished_at=_now_iso())
    except Exception as exc:
        # Safety net for a bug in this function itself (not a per-item
        # extraction failure — those are already caught inside
        # _process_one and never propagate here). Distinct from the
        # staleness detector: this only helps if the task is still alive
        # to reach it, which a killed worker process never is.
        LOGGER.error('extraction_batches: run_batch {} crashed: {}', batch_id, exc)
        await _update_batch(
            batch_id, status='failed', error_code='INTERNAL_ERROR',
            error_message='An unexpected error stopped this batch.', finished_at=_now_iso(),
        )
