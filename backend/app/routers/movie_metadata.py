import hashlib
from typing import Annotated, Any, Literal

import httpx
from config import settings
from auth.supabase_auth import AuthenticatedUser, get_current_user
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, status
from fastapi import Form
from fastapi.security import APIKeyHeader
from llm.llm_client import (
    PROVIDERS,
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
from services import extraction_cache, free_models, gemini_free_models, ticket_link_extractor
from services.quota import ensure_within_daily_quota
from utils import image
from utils.openai_utils import openai_error_to_http

from rate_limit import limiter

MultiPartParser.max_part_size = settings.max_part_size * 1024 * 1024
# To keep the file in memory, loads and processes it very quickly.
MultiPartParser.spool_max_size = settings.spool_max_size * 1024 * 1024


router = APIRouter()

Provider = Literal['openrouter', 'openai', 'gemini']

# One generic credential header for whichever provider is active, not a
# header per provider — OpenRouter, OpenAI, and Gemini are all reached
# through the same AsyncOpenAI-shaped client (see llm/llm_client.py), so
# only one credential is ever relevant per call. Renamed from
# X-OpenRouter-API-Key now that this endpoint isn't OpenRouter-only — no
# live frontend depends on the old name yet, so this is a clean rename.
llm_api_key_header = APIKeyHeader(name='X-LLM-API-Key', auto_error=False)

# Suggested, non-validated defaults for when `model` is omitted under
# provider='openai'. Unlike OpenRouter's default_free_model, this isn't
# checked against any "free" list — OpenAI has no meaningful free tier at
# all, so BYO-key-only means exactly that: whatever the key's owner picks
# (or this default) is billed at OpenAI's real rates. Confirmed live as a
# current, cheap, vision-capable model.
_OPENAI_DEFAULT_MODEL = 'gpt-4o-mini'


def get_header_api_key(api_key: str = Depends(llm_api_key_header)) -> str | None:
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


def require_llm_api_key(provider: Provider, header_api_key: str | None) -> str:
    """OpenAI/Gemini have no shared/free path at all — only OpenRouter
    does (see resolve_shared_api_key). This is the BYO-key gate for the
    other two: a missing key here is always a 400, never a fallback to
    anything shared."""

    if not header_api_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f'{PROVIDERS[provider].display_name} requires your own API key — there is '
            'no shared key for this provider. Provide one via the X-LLM-API-Key header.',
        )
    return header_api_key


async def resolve_model_name(
    provider: Provider, model: str | None, *, requires_image: bool = True
) -> str:
    if model:
        selected = model.strip()
        if not selected:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail='Model must not be empty.',
            )
        return selected

    if provider == 'openrouter':
        return await free_models.default_free_model(requires_image=requires_image)
    if provider == 'gemini':
        return await gemini_free_models.default_free_model()
    return _OPENAI_DEFAULT_MODEL


async def validate_shared_model(model_name: str) -> None:
    # OpenRouter-only — the shared-key path is OpenRouter-only to begin
    # with (see require_llm_api_key), so this is never reached for
    # openai/gemini. Checked against the dynamically-fetched free-model
    # snapshot (falls back to config.yaml, then the `:free` naming
    # convention, if that snapshot is entirely unavailable — see
    # services/free_models.py).
    if not await free_models.is_free_model(model_name):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='Selected shared model must be a free model.',
        )


async def resolve_llm_api_key(
    provider: Provider,
    model_name: str,
    header_api_key: str | None,
    current_user: AuthenticatedUser,
) -> str:
    """Resolves the api_key to actually call the provider with — the one
    piece of branching logic shared by /extract and /extract-from-link.
    Deliberately separate from resolve_model_name (pure, no side effects)
    so callers can do model-name resolution + a cache-hit check *before*
    ever reaching this — quota must never be touched on what turns out to
    be a cache hit. OpenRouter keeps exactly today's behavior (shared key
    + quota + free-model check when no header key is given, any model
    when one is); OpenAI/Gemini always require the header key, never
    touch quota or any free-model check — there's no shared key for
    either to protect."""

    if provider == 'openrouter':
        if header_api_key:
            return header_api_key
        await validate_shared_model(model_name)
        await ensure_within_daily_quota(current_user.user_id)
        return resolve_shared_api_key()

    return require_llm_api_key(provider, header_api_key)


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
        '2. **Your own LLM provider key** (required unless `provider=openrouter`, '
        'optional otherwise, `APIKeyHeader` / `X-LLM-API-Key`): `provider` picks which '
        'of `openrouter` (default), `openai`, or `gemini` handles this call. Only '
        '`openrouter` has a backend-funded shared/free path — leave the header blank '
        'with `provider=openrouter` to use it, limited to `DAILY_FREE_LIMIT` '
        'extractions per user per day (`QUOTA_DAILY_EXCEEDED` once you hit it). '
        '`openai`/`gemini` have no shared key at all: the header is **mandatory** for '
        'those two (`400` if missing), and there is no daily cap since nothing shared '
        "is being spent — you're always billed on your own key/quota.\n\n"
        '   - OpenRouter: [https://openrouter.ai/settings/keys](https://openrouter.ai/settings/keys)\n'
        '   - OpenAI: [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys)\n'
        '   - Gemini: [https://aistudio.google.com/apikey](https://aistudio.google.com/apikey) — '
        'has a real free tier (rate-limited, e.g. 5 requests/minute on `gemini-flash-latest` at '
        'the time of writing), unlike OpenAI which has none worth relying on.\n\n'
        'With your own key, `model` can be any model your key has access to on that '
        'provider; without one (`openrouter` only), it must be on the current free-model '
        'list. If omitted entirely, a sensible default is used per provider — a free '
        'OpenRouter model, `gemini-flash-latest` (Gemini\'s self-healing latest-flash '
        'alias), or `gpt-4o-mini` for OpenAI (not validated as "free" — OpenAI has no '
        'meaningful free tier).\n\n'
        '   Gemini specifically self-heals a stale/deprecated `model`: if the model you '
        'asked for 404s as not-found, one automatic retry is made against a current '
        'free-tier model before giving up — logged, not silent, and only for a genuine '
        '"not found," never for any other error. OpenRouter/OpenAI models that don\'t '
        'exist just fail normally.\n\n'
        '**Caching**: results are cached by the exact image content (not filename) plus '
        '`provider` and `model` — re-uploading the same ticket image with the same '
        'provider/model returns the cached result instantly, skips the LLM call '
        'entirely, and does **not** count against your daily quota (nothing was '
        'actually run). A different `provider` or `model` is a cache miss and runs '
        'normally.\n\n'
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
    provider: Annotated[Provider, Form()] = 'openrouter',
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

    # Model-name resolution is pure/side-effect-free (falls back to a
    # per-provider default when omitted — see resolve_model_name), so it
    # always happens before the cache check below, regardless of whether
    # the caller named a model explicitly.
    model_name = await resolve_model_name(provider, model)

    # Content-addressed cache: the same image bytes + same provider/model
    # always produce the same extraction, so a repeat upload (a user re-
    # uploading their own ticket, or two people sharing/photographing the
    # same physical ticket) can skip quota, key resolution, and the LLM
    # call entirely. A cache hit costs nothing real, so this deliberately
    # happens *before* resolve_llm_api_key — which is where quota gets
    # touched — never after. Model name alone isn't a safe cache key
    # across providers (unlikely collision today, but not guaranteed), so
    # provider is folded in.
    image_hash = await image.hash_upload(ticket_image)
    cached = await extraction_cache.get_cached_extraction(image_hash, f'{provider}:{model_name}')
    if cached is not None:
        LOGGER.info(
            'extract rid={} provider={} model={} cache=hit',
            getattr(request.state, 'request_id', '-'), provider, model_name,
        )
        return cached

    llm_api_key = await resolve_llm_api_key(provider, model_name, header_api_key, current_user)

    try:
        image_data_uri = await image.image_to_data_uri(ticket_image)
    except Exception as e:
        LOGGER.error(f'Failed to read uploaded file: {e}')
        raise HTTPException(status_code=400, detail='Invalid image file')

    try:
        ticket: MovieMetadata = await extract_movie_metadata_from_image(
            image_data_uri=image_data_uri,
            api_key=llm_api_key,
            system_prompt=movie_metadata.SYSTEM_PROMPT,
            user_prompt=movie_metadata.USER_PROMPT,
            response_model=MovieMetadata,
            model_name=model_name,
            provider=provider,
        )
        LOGGER.info(
            'extract rid={} provider={} model={} cache=miss',
            getattr(request.state, 'request_id', '-'), provider, model_name,
        )
        result = ticket.model_dump()
        await extraction_cache.store_extraction(image_hash, f'{provider}:{model_name}', result)
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
        'Same `provider`/`X-LLM-API-Key`/shared-key-vs-own-key/quota/free-model rules '
        'as `/extract` (see there for the full explanation), and the same content-'
        "addressed caching — here keyed by the scraped page text's content plus "
        'provider/model, not an image, so re-submitting the same link with the same '
        'provider/model is a free cache hit. Same catalog-matching note as `/extract` '
        'too: `movie` is a free-typed guess, call POST /movies/search with it once '
        'populated, rather than expecting a TMDB match bundled here.'
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
    provider: Provider = 'openrouter',
    model: str | None = None,
    header_api_key: str | None = Depends(get_header_api_key),
) -> MovieMetadata:
    request.state.user_id = current_user.user_id

    # Raises APIError(400, UNSUPPORTED_LINK) or APIError(422,
    # LINK_EXTRACTION_FAILED) on any problem — propagates straight through
    # to the client via the app-wide APIError handler, no try/except
    # needed here. Runs before quota/cache lookups: a link that was never
    # going to scrape shouldn't cost the user anything.
    page_text = await ticket_link_extractor.extract_visible_text(body.url)

    # requires_image=False: this is scraped page text, not a photo — no
    # reason to restrict the default to the image-capable subset of free
    # models the way /extract needs to (see free_models.default_free_model).
    model_name = await resolve_model_name(provider, model, requires_image=False)

    # Same content-addressed cache extract_movie_metadata() uses, keyed
    # by a hash of the scraped text plus provider/model instead of image
    # bytes — same reuse logic applies: identical page content + same
    # provider/model always produces the same extraction. Same ordering
    # rule as /extract: this happens *before* resolve_llm_api_key (where
    # quota gets touched), never after — a cache hit must never cost
    # anything real.
    content_hash = hashlib.sha256(page_text.encode('utf-8')).hexdigest()
    cached = await extraction_cache.get_cached_extraction(content_hash, f'{provider}:{model_name}')
    if cached is not None:
        LOGGER.info(
            'extract-from-link rid={} provider={} model={} cache=hit',
            getattr(request.state, 'request_id', '-'), provider, model_name,
        )
        return cached

    llm_api_key = await resolve_llm_api_key(provider, model_name, header_api_key, current_user)

    try:
        ticket: MovieMetadata = await extract_movie_metadata_from_text(
            page_text=page_text,
            api_key=llm_api_key,
            system_prompt=movie_metadata.SYSTEM_PROMPT_TEXT,
            user_prompt=movie_metadata.USER_PROMPT_TEXT,
            response_model=MovieMetadata,
            model_name=model_name,
            provider=provider,
        )
        LOGGER.info(
            'extract-from-link rid={} provider={} model={} cache=miss',
            getattr(request.state, 'request_id', '-'), provider, model_name,
        )
        result = ticket.model_dump()
        await extraction_cache.store_extraction(content_hash, f'{provider}:{model_name}', result)
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
        'Check whether a provider key (and, optionally, a model) works — without '
        'spending any tokens or credit. All three providers only make metadata-lookup '
        'calls here (list/retrieve models, or OpenRouter\'s own key-info endpoint), '
        'never a completion, so this is free regardless of how many times it\'s called '
        'or whether the key/model turn out to be valid.\n\n'
        'Pass the key via the same `X-LLM-API-Key` header `/extract` uses (required '
        'here for all three providers — there\'s no shared key to fall back to, this '
        'endpoint only makes sense for testing your own). `provider` selects which '
        'one to check against (`openrouter` default, or `openai`/`gemini`). `model` is '
        'optional; if given, the response also says whether that model exists. For '
        '`openrouter` this additionally reports modality/pricing/context-length — a '
        'real public catalog exists for it. `openai`/`gemini` have no equivalent public '
        'catalog, so only existence is reported for those two, not richer metadata.'
    ),
    response_description='Key and (optionally) model validity, never a 401/404 for '
    'an invalid key/model — those come back as valid=false/exists=false in a 200, '
    'since "the key is bad" is itself a useful, expected answer here.',
    responses=responses['test-key'],
    operation_id='TestProviderKey',
)
@limiter.limit(f'{settings.rate_limit_per_minute}/minute')
async def test_key(
    request: Request,
    header_api_key: str | None = Depends(get_header_api_key),
    provider: Provider = 'openrouter',
    model: str | None = None,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Any:
    if not header_api_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='Provide a key to test via the X-LLM-API-Key header.',
        )

    try:
        key_result = await check_api_key(provider, header_api_key)

        model_result = None
        if model:
            model_info = await check_model(provider, model, api_key=header_api_key)
            model_result = {'requested': model, 'exists': False, **(model_info or {})}
    except httpx.HTTPError as exc:
        # OpenRouter's branch of check_api_key/check_model uses raw httpx
        # calls — this is its error path, unchanged.
        LOGGER.error(f'test-key: could not reach {provider}: {exc}')
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail='Unexpected error from upstream service.',
        )
    except OpenAIError as exc:
        # OpenAI/Gemini's branch goes through the openai SDK client
        # instead (client.models.list/retrieve) — a connection/timeout/
        # server error there raises an OpenAIError subtype, not
        # httpx.HTTPError, so it needs its own mapping rather than
        # falling through to an unhandled 500.
        raise openai_error_to_http(exc)

    return {**key_result, 'provider': provider, 'model': model_result}
