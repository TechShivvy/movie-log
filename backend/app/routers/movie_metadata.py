import hashlib
from typing import Any

import httpx
from config import settings
from auth.supabase_auth import AuthenticatedUser, get_current_user
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, status
from fastapi import Form
from fastapi.security import APIKeyHeader
from llm.openrouter_client import (
    check_api_key,
    check_model,
    extract_movie_metadata_from_image,
    extract_movie_metadata_from_text,
)
from llm.prompts import movie_metadata
from loguru_setup import LOGGER
from openai import OpenAIError
from pydantic import ValidationError
from responses.movie_metadata import responses
from schemas.movie_metadata import MovieMetadata, TicketLinkRequest
from starlette.formparsers import MultiPartParser
from services import extraction_cache, free_models, ticket_link_extractor
from services.quota import ensure_within_daily_quota
from utils import image
from utils.openai_utils import openai_error_to_http

from rate_limit import limiter

MultiPartParser.max_part_size = settings.max_part_size * 1024 * 1024
# To keep the file in memory, loads and processes it very quickly.
MultiPartParser.spool_max_size = settings.spool_max_size * 1024 * 1024


router = APIRouter()

openrouter_api_key_header = APIKeyHeader(name='X-OpenRouter-API-Key', auto_error=False)


def get_header_api_key(api_key: str = Depends(openrouter_api_key_header)) -> str | None:
    return api_key


def resolve_shared_api_key() -> str:
    api_key = (
        settings.openrouter_api_key.get_secret_value()
        if settings.openrouter_api_key
        else None
    )
    if not api_key:
        LOGGER.error('OpenRouter API key is not configured')
        raise HTTPException(
            status_code=500,
            detail='OpenRouter API key is missing. Please provide it in the header or configure it in the backend settings.',
        )
    return api_key


async def resolve_model_name(model: str | None, *, requires_image: bool = True) -> str:
    selected_model = (model or await free_models.default_free_model(requires_image=requires_image)).strip()
    if not selected_model:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='Model must not be empty.',
        )
    return selected_model


async def validate_shared_model(model_name: str) -> None:
    # Checked against the dynamically-fetched free-model snapshot (falls
    # back to config.yaml, then the `:free` naming convention, if that
    # snapshot is entirely unavailable — see services/free_models.py).
    if not await free_models.is_free_model(model_name):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='Selected shared model must be a free model.',
        )


@router.post(
    path='/extract',
    tags=['Extract Movie Metadata'],
    description=(
        'Extract movie metadata from an uploaded ticket image.\n\n'
        'This endpoint needs **two separate things** from the "Authorize" button '
        '(top right) — they are independent locks, both shown in the same dialog:\n\n'
        '1. **Sign in** (required, `OAuth2AuthorizationCodeBearer`): identifies you as '
        'a user — needed for every endpoint in this API, not just this one. Either '
        'click "Authorize" to sign in with Google (LOCAL/DEV only), or paste a '
        'Supabase access token directly.\n\n'
        '2. **Your own OpenRouter key** (optional, `APIKeyHeader` / `X-OpenRouter-API-Key`): '
        'if you provide one here, your requests use *your* key with no daily cap. '
        'Leave it blank to use the shared free-tier key, which is limited to '
        '`DAILY_FREE_LIMIT` extractions per user per day '
        '(`QUOTA_DAILY_EXCEEDED` once you hit it).\n\n'
        '   - Get a key at [https://openrouter.ai/settings/keys](https://openrouter.ai/settings/keys) '
        '→ "Create Key".\n'
        '   - Paste it into the `X-OpenRouter-API-Key` field in the Authorize dialog.\n\n'
        'With your own key, `model` can be any OpenRouter model your key has access to; '
        'without one, it must be on the current free-model list (checked live against '
        'a snapshot of OpenRouter'"'"'s free-tier catalog, not a hardcoded allowlist — '
        'see `GET /test-key` to check a model before using it).\n\n'
        '**Caching**: results are cached by the exact image content (not filename) '
        'plus `model` — re-uploading the same ticket image with the same model '
        'returns the cached result instantly, skips the LLM call entirely, and '
        "does **not** count against your daily quota (nothing was actually run). "
        'Uploading the same image with a different `model` is a cache miss and '
        'runs normally.\n\n'
        '**Catalog matching**: the returned `movie` is a free-typed guess, not a '
        'TMDB match — deliberately not resolved here, since that would tie this '
        "endpoint's latency/reliability to a third-party call it doesn't need. "
        'Once `movie` is populated (from this response or typed by hand), call '
        'POST /movies/search with it — same debounced search-as-you-type call '
        'either way, autofilled or manual.'
    ),
    response_description='Movie Metadata',
    response_model=MovieMetadata,
    responses=responses['/extract'],
    operation_id='ExtractTicketImage',
)
@limiter.limit(f"{settings.rate_limit_per_minute}/minute")
async def extract_movie_metadata(
    request: Request,
    ticket_image: UploadFile = Depends(image.validate_image_file),
    _cl: None = Depends(image.validate_content_length),
    current_user: AuthenticatedUser = Depends(get_current_user),
    model: str | None = Form(default=None),
    header_api_key: str | None = Depends(get_header_api_key),
) -> MovieMetadata:
    request.state.user_id = current_user.user_id

    if ticket_image.content_type not in {
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/webp',
    }:
        raise HTTPException(
            400, 'Invalid file type: only JPEG, JPG, PNG, or WebP allowed'
        )

    LOGGER.debug(f'{ticket_image._in_memory = }')

    model_name = await resolve_model_name(model)

    # Content-addressed cache: the same image bytes + same model always
    # produce the same extraction, so a repeat upload (a user re-uploading
    # their own ticket, or two people sharing/photographing the same
    # physical ticket) can skip quota, key resolution, and the LLM call
    # entirely. A cache hit costs nothing real, so it deliberately never
    # touches ensure_within_daily_quota — that's meant to bound actual LLM
    # spend, not repeat reads of an already-computed answer.
    image_hash = await image.hash_upload(ticket_image)
    cached = await extraction_cache.get_cached_extraction(image_hash, model_name)
    if cached is not None:
        LOGGER.info(
            'extract rid={} model={} cache=hit',
            getattr(request.state, 'request_id', '-'),
            model_name,
        )
        return cached

    if header_api_key:
        openrouter_api_key = header_api_key
    else:
        await validate_shared_model(model_name)
        await ensure_within_daily_quota(current_user.user_id)
        openrouter_api_key = resolve_shared_api_key()

    try:
        image_data_uri = await image.image_to_data_uri(ticket_image)
    except Exception as e:
        LOGGER.error(f'Failed to read uploaded file: {e}')
        raise HTTPException(status_code=400, detail='Invalid image file')

    try:
        ticket: MovieMetadata = await extract_movie_metadata_from_image(
            image_data_uri=image_data_uri,
            api_key=openrouter_api_key,
            system_prompt=movie_metadata.SYSTEM_PROMPT,
            user_prompt=movie_metadata.USER_PROMPT,
            response_model=MovieMetadata,
            model_name=model_name,
        )
        LOGGER.info(
            'extract rid={} model={} cache=miss',
            getattr(request.state, 'request_id', '-'),
            model_name,
        )
        result = ticket.model_dump()
        await extraction_cache.store_extraction(image_hash, model_name, result)
        return result
    except ValidationError as e:
        LOGGER.error(f'Validation error parsing movie metadata: {e}')
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail='Failed to parse movie metadata from response',
        )
    except OpenAIError as e:
        raise openai_error_to_http(e)
    except RuntimeError as e:
        LOGGER.error(f'Model response parsing failed: {e}')
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail='Model returned an invalid/non-JSON response. Try a specific free model such as qwen/qwen2.5-vl-72b-instruct:free.',
        )
    except Exception as e:
        LOGGER.error(f'Unexpected error during metadata extraction: {e}')
        raise e


@router.post(
    path='/extract-from-link',
    tags=['Extract Movie Metadata'],
    description=(
        'Extract movie metadata from a shared ticket booking-confirmation link '
        '(BookMyShow, Fandango, PVR, District, ...) instead of a photo — an optional, '
        "best-effort alternative to `POST /extract`, not a replacement: only a fixed "
        'allowlist of known ticketing sites is supported (see '
        '`services/ticket_link_extractor.py`), and any given link can fail to render '
        '(`LINK_EXTRACTION_FAILED`) even for a supported site. On failure, fall back '
        'to `/extract` with a photo — the frontend should treat this as expected, not '
        'exceptional.\n\n'
        'Same two Authorize locks, same shared-key-vs-own-key/quota/free-model rules, '
        'and the same content-addressed caching as `/extract` — here keyed by the '
        "scraped page text's content, not an image, so re-submitting the same link "
        'with the same model is a free cache hit. Same catalog-matching note as '
        '`/extract` too: `movie` is a free-typed guess, call POST /movies/search '
        'with it once populated, rather than expecting a TMDB match bundled here.'
    ),
    response_description='Movie Metadata',
    response_model=MovieMetadata,
    responses=responses['extract-from-link'],
    operation_id='ExtractFromTicketLink',
)
@limiter.limit(f'{settings.rate_limit_per_minute}/minute')
async def extract_movie_metadata_from_link(
    request: Request,
    body: TicketLinkRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    model: str | None = None,
    header_api_key: str | None = Depends(get_header_api_key),
) -> MovieMetadata:
    request.state.user_id = current_user.user_id

    # requires_image=False: this is scraped page text, not a photo — no
    # reason to restrict the default to the image-capable subset of free
    # models the way /extract needs to (see free_models.default_free_model).
    model_name = await resolve_model_name(model, requires_image=False)

    # Raises APIError(400, UNSUPPORTED_LINK) or APIError(422,
    # LINK_EXTRACTION_FAILED) on any problem — propagates straight through
    # to the client via the app-wide APIError handler, no try/except
    # needed here. Runs before quota/cache lookups: a link that was never
    # going to scrape shouldn't cost the user anything.
    page_text = await ticket_link_extractor.extract_visible_text(body.url)

    # Same content-addressed cache extract_movie_metadata() uses, keyed
    # by a hash of the scraped text instead of image bytes — same reuse
    # logic applies: identical page content + model always produces the
    # same extraction.
    content_hash = hashlib.sha256(page_text.encode('utf-8')).hexdigest()
    cached = await extraction_cache.get_cached_extraction(content_hash, model_name)
    if cached is not None:
        LOGGER.info(
            'extract-from-link rid={} model={} cache=hit',
            getattr(request.state, 'request_id', '-'),
            model_name,
        )
        return cached

    if header_api_key:
        openrouter_api_key = header_api_key
    else:
        await validate_shared_model(model_name)
        await ensure_within_daily_quota(current_user.user_id)
        openrouter_api_key = resolve_shared_api_key()

    try:
        ticket: MovieMetadata = await extract_movie_metadata_from_text(
            page_text=page_text,
            api_key=openrouter_api_key,
            system_prompt=movie_metadata.SYSTEM_PROMPT_TEXT,
            user_prompt=movie_metadata.USER_PROMPT_TEXT,
            response_model=MovieMetadata,
            model_name=model_name,
        )
        LOGGER.info(
            'extract-from-link rid={} model={} cache=miss',
            getattr(request.state, 'request_id', '-'),
            model_name,
        )
        result = ticket.model_dump()
        await extraction_cache.store_extraction(content_hash, model_name, result)
        return result
    except ValidationError as e:
        LOGGER.error(f'Validation error parsing movie metadata: {e}')
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail='Failed to parse movie metadata from response',
        )
    except OpenAIError as e:
        raise openai_error_to_http(e)
    except RuntimeError as e:
        LOGGER.error(f'Model response parsing failed: {e}')
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail='Model returned an invalid/non-JSON response.',
        )
    except Exception as e:
        LOGGER.error(f'Unexpected error during link metadata extraction: {e}')
        raise e


@router.get(
    path='/test-key',
    tags=['Extract Movie Metadata'],
    description=(
        'Check whether an OpenRouter key (and, optionally, a model) works — '
        'without spending any tokens or credit. Both OpenRouter calls this makes '
        '(`GET /api/v1/key`, `GET /api/v1/models`) are pure metadata lookups, not '
        'chat completions, so this is free regardless of how many times it\'s '
        'called or whether the key/model turn out to be valid.\n\n'
        'Pass the key via the same `X-OpenRouter-API-Key` header /extract uses '
        '(required here — there\'s no shared key to fall back to, this endpoint '
        'only makes sense for testing your own). `model` is optional; if given, '
        'the response also says whether that model exists and whether it accepts '
        'image input (relevant here since every /extract call sends an image).'
    ),
    response_description='Key and (optionally) model validity, never a 401/404 for '
    'an invalid key/model — those come back as valid=false/exists=false in a 200, '
    'since "the key is bad" is itself a useful, expected answer here.',
    responses=responses['test-key'],
    operation_id='TestOpenRouterKey',
)
@limiter.limit(f'{settings.rate_limit_per_minute}/minute')
async def test_key(
    request: Request,
    header_api_key: str | None = Depends(get_header_api_key),
    model: str | None = None,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Any:
    if not header_api_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='Provide a key to test via the X-OpenRouter-API-Key header.',
        )

    try:
        key_result = await check_api_key(header_api_key)

        model_result = None
        if model:
            model_info = await check_model(model)
            model_result = {'requested': model, 'exists': False, **(model_info or {})}
    except httpx.HTTPError as exc:
        LOGGER.error(f'test-key: could not reach OpenRouter: {exc}')
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail='Unexpected error from upstream service.',
        )

    return {**key_result, 'model': model_result}
