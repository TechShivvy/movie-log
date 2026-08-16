"""Batch ticket extraction: POST /movie-metadata/extract-batch accepts up
to settings.max_batch_size images, resolves provider/model/key once for
the whole request, and processes them as an in-process background task
(services/extraction_batches.py) that outlives the initiating request —
this app has no Celery/Redis/task queue (see backend/scripts/
docker-entry.sh's gunicorn config). GET .../extract-batch/{id} polls
progress; a real notification fires on completion (see
supabase/migrations/20260817000002_auto_insert.sql's
notify_on_batch_extraction_complete trigger) — no webhook delivery in
this pass.
"""

import asyncio
from typing import Annotated, Any, List, Optional

from auth.supabase_auth import AuthenticatedUser, get_current_user
from config import settings
from fastapi import APIRouter, Depends, File, Form, Request, UploadFile, status
from loguru_setup import LOGGER
from rate_limit import limiter
from responses.extraction_batches import responses
from routers.movie_metadata import (
    Provider,
    ensure_provider_authorized,
    get_header_api_key,
    require_llm_api_key,
    resolve_provider_and_model,
    resolve_shared_api_key,
    validate_shared_model,
)
from schemas.extraction_batches import ExtractionBatch, ExtractionBatchCreateResponse
from services import auto_insert as auto_insert_service
from services import extraction_batches, llm_keys, supabase_rest
from utils import image
from utils.errors import APIError

router = APIRouter()

_BATCH_CREATE_LIMIT = f'{settings.batch_create_rate_limit_per_minute}/minute'


async def resolve_batch_api_key(
    provider: Provider, model_name: str, header_api_key: Optional[str], current_user: AuthenticatedUser,
) -> tuple[str, bool]:
    """Same key-selection order as routers/movie_metadata.py's own
    resolve_llm_api_key (header -> stored key -> shared OpenRouter key ->
    require_llm_api_key 400), deliberately reimplemented rather than
    reused: resolve_llm_api_key calls ensure_within_daily_quota() itself
    on the shared-key path, which is exactly right for one extraction per
    call, but would double-count quota here — a batch calls this once for
    the *whole* batch, then services/extraction_batches.run_batch touches
    quota once per *item* in its own loop. Returns (api_key,
    is_shared_key_path) — the second is what run_batch uses to decide
    whether to touch quota per item at all."""

    if header_api_key:
        return header_api_key, False

    stored_key = await llm_keys.get_decrypted_llm_key(current_user.user_id, provider)
    if stored_key:
        return stored_key, False

    if provider == 'openrouter':
        await validate_shared_model(model_name)
        return resolve_shared_api_key(), True

    return require_llm_api_key(provider, header_api_key), False


@router.post(
    path='/extract-batch',
    tags=['Extract Movie Metadata'],
    status_code=status.HTTP_202_ACCEPTED,
    response_model=ExtractionBatchCreateResponse,
    description=(
        f'Batch ticket extraction — up to {{max_batch_size}} images in one call, '
        'processed in the background (this request returns immediately once the batch '
        'is created, well before any image is actually processed). Poll '
        '`GET /movie-metadata/extract-batch/{{id}}` for progress (`completed_items`/'
        '`failed_items` out of `total_items`, plus each item\'s own result once done) — '
        'a notification also fires when the whole batch finishes '
        '(`batch_extraction_complete`), so a client doesn\'t have to keep polling with '
        'the tab open.\n\n'
        '`provider`/`model`/`auto_fallback`/`auto_insert` apply once, to every image in '
        'the batch — same resolution rules as `POST /extract` (see there for the full '
        'explanation): request value beats stored preference beats static default. '
        'Authorization is checked once, up front — an unusable provider/key 400s before '
        'any batch or item row is created, no partial batch left behind.\n\n'
        'One bad image (wrong format, a genuinely unreadable photo) fails *that item*, '
        'never the whole batch — check each item\'s own `status`/`error_code` rather '
        'than assuming an all-or-nothing outcome. Images are processed with real '
        "internal pacing against each provider's rate limits (tighter for Gemini's real "
        '~5 RPM free tier than for OpenRouter/OpenAI), not fired all at once.'
    ).format(max_batch_size=settings.max_batch_size),
    response_description='The created batch, in `processing` status.',
    responses=responses['create_batch'],
    operation_id='CreateExtractionBatch',
)
@limiter.limit(_BATCH_CREATE_LIMIT)
async def create_extraction_batch(
    request: Request,
    ticket_images: List[UploadFile] = File(
        ..., description=f'Up to {settings.max_batch_size} ticket images (JPEG, PNG, or WebP).',
    ),
    current_user: AuthenticatedUser = Depends(get_current_user),
    provider: Annotated[Optional[Provider], Form()] = None,
    model: str | None = Form(default=None),
    auto_fallback: Annotated[bool, Form()] = False,
    auto_insert: Annotated[Optional[bool], Form()] = None,
    header_api_key: str | None = Depends(get_header_api_key),
) -> Any:
    request.state.user_id = current_user.user_id

    if not ticket_images:
        raise APIError(400, 'BAD_REQUEST', 'At least one image is required.')
    if len(ticket_images) > settings.max_batch_size:
        raise APIError(
            400, 'BATCH_TOO_LARGE',
            f'A batch accepts at most {settings.max_batch_size} images '
            f'({len(ticket_images)} given) — submit the rest as a second batch.',
        )

    effective_provider, model_name = await resolve_provider_and_model(provider, model, current_user)

    # Same authorization gate /extract uses — a clean 400 here, before
    # any batch/item row exists and with zero real LLM calls made, if
    # this provider has no usable key at all.
    await ensure_provider_authorized(effective_provider, header_api_key, current_user)

    llm_api_key, is_shared_key_path = await resolve_batch_api_key(
        effective_provider, model_name, header_api_key, current_user
    )

    # Read every file's raw bytes now — an UploadFile's backing file
    # doesn't survive past this request, but the background task
    # (services/extraction_batches.run_batch) runs well after it ends.
    # Per-item content-type sniffing (not a whole-request rejection): a
    # bad file in an otherwise-good batch should fail that one item, not
    # block the rest — the actual per-item validation-to-'failed'-status
    # happens inside run_batch itself for items whose real content type
    # doesn't match what was declared; this pass only builds the list.
    items: list[tuple[str, bytes, str]] = []
    for upload in ticket_images:
        content = await upload.read()
        detected = image.detect_image_mime(content[:1024])
        content_type = detected if detected in image.ALLOWED_IMAGE_MIME_TYPES else (upload.content_type or 'image/jpeg')
        items.append((upload.filename or 'ticket.jpg', content, content_type))

    effective_auto_insert = await auto_insert_service.resolve_auto_insert(
        auto_insert, current_user.access_token, current_user.user_id
    )

    batch, item_ids = await extraction_batches.create_batch(
        user_id=current_user.user_id,
        provider=effective_provider,
        model=model_name,
        auto_fallback=auto_fallback,
        auto_insert=effective_auto_insert,
        items=items,
    )

    task = asyncio.create_task(
        extraction_batches.run_batch(
            batch_id=batch['id'],
            item_ids=item_ids,
            items=items,
            user_id=current_user.user_id,
            user_token=current_user.access_token,
            llm_api_key=llm_api_key,
            provider=effective_provider,
            model=model_name,
            auto_fallback=auto_fallback,
            auto_insert=effective_auto_insert,
            is_shared_key_path=is_shared_key_path,
        )
    )
    extraction_batches.track_task(task)

    LOGGER.info(
        'extract-batch rid={} batch={} items={} provider={} model={}',
        getattr(request.state, 'request_id', '-'), batch['id'], len(items), effective_provider, model_name,
    )
    return {'id': batch['id'], 'status': 'processing', 'total_items': len(items)}


@router.get(
    path='/extract-batch/{batch_id}',
    tags=['Extract Movie Metadata'],
    response_model=ExtractionBatch,
    description='Poll a batch\'s progress and results. `status` is `processing` until '
    'every item resolves (successfully or not); once terminal it\'s `completed` '
    '(finished — not necessarily every item succeeded, see `failed_items`) or `failed` '
    '(the whole batch failed outright, e.g. `STALLED` if the worker processing it '
    'appears to have died mid-run — a rare but real possibility, see the endpoint\'s own '
    'docs for why). Each item under `items` carries its own `status`/`result`/'
    '`error_code` independently.',
    response_description='The batch and all of its items.',
    responses=responses['get_batch'],
    operation_id='GetExtractionBatch',
)
async def get_extraction_batch(
    request: Request,
    batch_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Any:
    batch = await supabase_rest.get_extraction_batch(
        current_user.access_token, current_user.user_id, batch_id
    )
    if not batch:
        raise APIError(404, 'NOT_FOUND', 'Extraction batch not found.')

    if batch['status'] == 'processing':
        from datetime import datetime, timedelta, timezone
        last_progress = datetime.fromisoformat(batch['last_progress_at'].replace('Z', '+00:00'))
        if datetime.now(timezone.utc) - last_progress > timedelta(minutes=settings.batch_stale_after_minutes):
            await extraction_batches.mark_stale(batch_id)
            batch = await supabase_rest.get_extraction_batch(
                current_user.access_token, current_user.user_id, batch_id
            )

    items = await supabase_rest.list_extraction_batch_items(current_user.access_token, batch_id)
    return {**batch, 'items': items}


@router.get(
    path='/extract-batch',
    tags=['Extract Movie Metadata'],
    response_model=List[ExtractionBatch],
    description='The caller\'s own past batches, newest first — same shape as '
    '`GET /extract-batch/{id}` but without each batch\'s items (call the single-batch '
    'endpoint for those).',
    response_description='The caller\'s batches.',
    responses=responses['list_batches'],
    operation_id='ListExtractionBatches',
)
async def list_extraction_batches_route(
    request: Request,
    current_user: AuthenticatedUser = Depends(get_current_user),
    limit: int = 20,
    offset: int = 0,
) -> Any:
    return await supabase_rest.list_extraction_batches(
        current_user.access_token, current_user.user_id, limit=min(limit, 100), offset=max(offset, 0)
    )
