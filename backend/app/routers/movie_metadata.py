import hashlib
from typing import Annotated, Any, Literal, Optional

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
from schemas.movie_metadata import MovieMetadata, MovieMetadataResult, TicketLinkRequest
from starlette.formparsers import MultiPartParser
from services import (
    auto_insert as auto_insert_service,
    extraction_cache,
    free_models,
    gemini_free_models,
    llm_keys,
    supabase_rest,
    ticket_link_extractor,
)
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


async def ensure_provider_authorized(
    provider: Provider, header_api_key: str | None, current_user: AuthenticatedUser,
) -> None:
    """Cheap, side-effect-free (no quota touched) authorization gate, run
    *before* the content-addressed cache check in both /extract and
    /extract-from-link. Raises the same 400 require_llm_api_key would.

    Real bug this guards against (caught by test_llm_provider_resolution.py
    against the real cache, not a mock): OpenAI/Gemini have no shared key
    — resolve_llm_api_key() is what enforces that — but the cache check
    runs *before* resolve_llm_api_key (deliberately, so a genuine cache
    hit never touches quota). Without this gate, a user with no key at
    all for a BYO-only provider could get a 200 instead of the expected
    400 whenever *any* other user had ever produced a cached result for
    the same image/text + provider + model — effectively riding on a
    stranger's key. OpenRouter is unaffected: it always has the shared
    key as a fallback, so there's nothing to gate here for it — the
    quota check stays exactly where it was, inside resolve_llm_api_key,
    skipped on a real cache hit as intended."""

    if provider == 'openrouter' or header_api_key:
        return
    if await llm_keys.get_decrypted_llm_key(current_user.user_id, provider):
        return
    require_llm_api_key(provider, header_api_key)


async def default_model_for(provider: Provider, *, requires_image: bool = True) -> str:
    """The per-provider suggested/free default — used both when `model`
    is omitted entirely and (see llm/llm_client.py) as the auto_fallback
    retry target when a requested model 404s as not-found."""

    if provider == 'openrouter':
        return await free_models.default_free_model(requires_image=requires_image)
    if provider == 'gemini':
        return await gemini_free_models.default_free_model()
    return _OPENAI_DEFAULT_MODEL


async def resolve_provider_and_model(
    provider: Optional[Provider],
    model: Optional[str],
    current_user: AuthenticatedUser,
    *,
    requires_image: bool = True,
) -> tuple[Provider, str]:
    """provider/model resolution order: the explicit request value, then
    the caller's stored preference (user_settings.preferred_provider/
    preferred_model — see PATCH /public/me/llm-preference), then the
    static per-provider default. Only reads user_settings when actually
    needed (either is omitted) — a request that fully specifies both
    pays no extra DB read. A user who's never touched any settings
    endpoint has no user_settings row at all, so this falls through to
    exactly the pre-existing static-default behavior for them, unchanged.

    The stored `preferred_model` is only ever used when the *effective*
    provider matches the stored `preferred_provider` — the two are set
    together (LlmPreferenceUpdate requires both in one call), so a
    stored model is meaningless paired with a different provider. Caught
    live: an explicit provider=openrouter override with no explicit
    model, while a gemini preference was stored, was falling through to
    the *Gemini* model name and sending it to OpenRouter — fixed by this
    match check rather than blindly using whatever preferred_model holds."""

    stored: dict = {}
    if provider is None or not model:
        stored = await supabase_rest.get_own_settings(
            current_user.access_token, current_user.user_id
        )

    effective_provider: Provider = provider or stored.get('preferred_provider') or 'openrouter'

    if model:
        selected = model.strip()
        if not selected:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail='Model must not be empty.',
            )
        return effective_provider, selected

    stored_model = stored.get('preferred_model')
    stored_provider = stored.get('preferred_provider')
    if stored_model and stored_provider == effective_provider:
        return effective_provider, stored_model

    return effective_provider, await default_model_for(effective_provider, requires_image=requires_image)


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
    Deliberately separate from resolve_provider_and_model (pure, no side
    effects) so callers can do provider/model resolution + a cache-hit
    check *before* ever reaching this — quota must never be touched on
    what turns out to be a cache hit.

    Resolution order: the request's own X-LLM-API-Key header, then the
    caller's own stored key for this provider (PUT /public/me/llm-keys/
    {provider} — decrypted here, server-side only), then — OpenRouter
    only — the shared backend key, gated by quota + the free-model check
    same as always. OpenAI/Gemini still 400 if nothing at any of those
    three levels is available — there's no shared key for either to fall
    back to."""

    if header_api_key:
        return header_api_key

    stored_key = await llm_keys.get_decrypted_llm_key(current_user.user_id, provider)
    if stored_key:
        return stored_key

    if provider == 'openrouter':
        await validate_shared_model(model_name)
        await ensure_within_daily_quota(current_user.user_id)
        return resolve_shared_api_key()

    return require_llm_api_key(provider, header_api_key)


async def apply_auto_insert(
    result: dict,
    *,
    auto_insert: Optional[bool],
    current_user: AuthenticatedUser,
    content: Optional[bytes],
    content_type: Optional[str],
) -> dict:
    """Resolves and, if applicable, performs auto-insert on top of an
    already-computed extraction result dict — called after both the
    cache-hit and cache-miss branches converge on a shared `result`, and
    always run fresh regardless of which branch produced it (see
    MovieMetadataResult.auto_insert_status's own docstring: a cached
    blob's auto_insert_status/movie_log_id are always None, since caching
    happens before this ever runs — so a cache hit still creates a new
    log if auto_insert resolves true, it never echoes a stale one)."""

    effective = await auto_insert_service.resolve_auto_insert(
        auto_insert, current_user.access_token, current_user.user_id
    )
    if not effective:
        return result
    metadata = MovieMetadata(**{k: result.get(k) for k in MovieMetadata.model_fields})
    status_, log_id = await auto_insert_service.auto_insert_log(
        user_id=current_user.user_id,
        user_token=current_user.access_token,
        metadata=metadata,
        content=content,
        content_type=content_type,
        extraction_provider=result['used_provider'],
        extraction_model=result['used_model'],
    )
    return {**result, 'auto_insert_status': status_, 'movie_log_id': log_id}


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
        '2. **Your own LLM provider key** (required unless `provider` resolves to '
        '`openrouter`, optional otherwise, `APIKeyHeader` / `X-LLM-API-Key`). Only '
        '`openrouter` has a backend-funded shared/free path.\n\n'
        '**`provider`/`model` resolution order** — the same three-level fallback for '
        'both: (1) whatever you send this call, (2) your stored preference '
        '(`PATCH /public/me/llm-preference`), (3) a static default (a free OpenRouter '
        'model, `gemini-flash-latest`, or `gpt-4o-mini`). Same idea for the credential: '
        '(1) `X-LLM-API-Key` this call, (2) a key you stored via '
        '`PUT /public/me/llm-keys/{provider}`, (3) — `openrouter` only — the shared '
        'backend key, limited to `DAILY_FREE_LIMIT` extractions/day '
        '(`QUOTA_DAILY_EXCEEDED` once hit). `openai`/`gemini` still `400` if nothing at '
        "any of those three levels is available — there's no shared key for either.\n\n"
        '   - OpenRouter: [https://openrouter.ai/settings/keys](https://openrouter.ai/settings/keys)\n'
        '   - OpenAI: [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys)\n'
        '   - Gemini: [https://aistudio.google.com/apikey](https://aistudio.google.com/apikey) — '
        'has a real free tier (rate-limited, e.g. 5 requests/minute on `gemini-flash-latest` at '
        'the time of writing), unlike OpenAI which has none worth relying on.\n\n'
        '**`auto_fallback`** (default `false`): if the resolved `model` 404s as not-found, '
        'off means fail normally; on retries once against that provider\'s default/'
        'suggested model instead. Every response — regardless of `auto_fallback` — always '
        'carries `used_provider`/`used_model` (which actually served this extraction) and '
        '`requested_model` (equal to `used_model` unless a fallback fired), plus '
        '`fallback_occurred`, so the client always knows which model produced a result '
        '(worth a small "Extracted with Gemini" attribution in the UI) and can toast the '
        'rarer swap case — "used {used_model} instead of {requested_model}."\n\n'
        '**Caching**: results are cached by the exact image content (not filename) plus '
        'the resolved `provider`/`model` (not `used_model` — a repeat request for the '
        'same since-removed model correctly re-reports the fallback from cache rather '
        'than re-discovering it) — re-uploading the same ticket image with the same '
        'resolved provider/model returns the cached result instantly, skips the LLM call '
        'entirely, and does **not** count against your daily quota (nothing was '
        'actually run).\n\n'
        '**Catalog matching**: the returned `movie` is a free-typed guess, not a '
        'TMDB match — deliberately not resolved here, since that would tie this '
        "endpoint's latency/reliability to a third-party call it doesn't need. "
        'Once `movie` is populated (from this response or typed by hand), call '
        'POST /movies/search with it — same debounced search-as-you-type call '
        'either way, autofilled or manual.\n\n'
        '**`auto_insert`** (default: unset — falls back to the caller\'s stored '
        '`PATCH /public/me/auto-insert-preference` value, `false` if never set): when '
        'true, skips the usual client-side review step and inserts the extraction '
        'straight into `movie_logs` — meant for bot integrations (Discord/Telegram) '
        'with no UI to review/edit first, though any client can pass it. An explicit '
        'value here always wins over the stored default. The response\'s '
        '`auto_insert_status` (`inserted`/`skipped_no_title`/`failed`) and '
        '`movie_log_id` report the outcome — a failed auto-insert never fails the '
        'extraction call itself, you still get your metadata either way. Runs fresh '
        'on every call, including a cache hit — re-uploading the same ticket with '
        '`auto_insert: true` creates a new log each time, not a stale echo of '
        'whatever happened the first time.'
    ),
    response_description='Movie Metadata',
    response_model=MovieMetadataResult,
    responses=responses['/extract'],
    operation_id='ExtractTicketImage',
)
@limiter.limit(f"{settings.rate_limit_per_minute}/minute")
async def extract_movie_metadata(
    request: Request,
    ticket_image: UploadFile = Depends(image.validate_image_file),
    _cl: None = Depends(image.validate_content_length),
    current_user: AuthenticatedUser = Depends(get_current_user),
    provider: Annotated[Optional[Provider], Form()] = None,
    model: str | None = Form(default=None),
    auto_fallback: Annotated[bool, Form()] = False,
    auto_insert: Annotated[Optional[bool], Form()] = None,
    header_api_key: str | None = Depends(get_header_api_key),
) -> MovieMetadataResult:
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

    # Read the raw bytes exactly once, up front — reused for hashing, the
    # data URI, and (if auto_insert resolves true) the Storage upload,
    # instead of re-reading/seeking the same UploadFile multiple times.
    content = await ticket_image.read()

    # Provider/model resolution is pure/side-effect-free (request value >
    # stored preference > static default — see resolve_provider_and_model),
    # so it always happens before the cache check below, regardless of
    # whether the caller specified either explicitly.
    effective_provider, model_name = await resolve_provider_and_model(provider, model, current_user)

    # Authorization (not quota) gate: a user with no usable key at all for
    # a BYO-only provider must never see a 200 just because someone else
    # already produced a cached result for these exact bytes — see
    # ensure_provider_authorized's docstring for the real bug this fixes.
    # Side-effect-free (no quota touched), so it's safe to run before the
    # cache check below.
    await ensure_provider_authorized(effective_provider, header_api_key, current_user)

    # Content-addressed cache: the same image bytes + same provider/model
    # always produce the same extraction, so a repeat upload (a user re-
    # uploading their own ticket, or two people sharing/photographing the
    # same physical ticket) can skip quota, key resolution, and the LLM
    # call entirely. A cache hit costs nothing real, so this deliberately
    # happens *before* resolve_llm_api_key — which is where quota gets
    # touched — never after. Model name alone isn't a safe cache key
    # across providers (unlikely collision today, but not guaranteed), so
    # provider is folded in.
    image_hash = image.hash_bytes(content)
    cached = await extraction_cache.get_cached_extraction(image_hash, f'{effective_provider}:{model_name}')
    if cached is not None:
        LOGGER.info(
            'extract rid={} provider={} model={} cache=hit',
            getattr(request.state, 'request_id', '-'), effective_provider, model_name,
        )
        result = cached
    else:
        llm_api_key = await resolve_llm_api_key(effective_provider, model_name, header_api_key, current_user)
        image_data_uri = image.bytes_to_data_uri(content, ticket_image.content_type)

        try:
            ticket: MovieMetadata
            used_model: str
            ticket, used_model = await extract_movie_metadata_from_image(
                image_data_uri=image_data_uri,
                api_key=llm_api_key,
                system_prompt=movie_metadata.SYSTEM_PROMPT,
                user_prompt=movie_metadata.USER_PROMPT,
                response_model=MovieMetadata,
                model_name=model_name,
                provider=effective_provider,
                auto_fallback=auto_fallback,
            )
            LOGGER.info(
                'extract rid={} provider={} model={} used_model={} cache=miss',
                getattr(request.state, 'request_id', '-'), effective_provider, model_name, used_model,
            )
            final = MovieMetadataResult(
                **ticket.model_dump(),
                used_provider=effective_provider,
                used_model=used_model,
                requested_model=model_name,
                fallback_occurred=used_model != model_name,
            )
            result = final.model_dump()
            # Cached under the originally *requested* model, not used_model —
            # a repeat request for the same (now-missing) model should still
            # get the fast cache-hit path (and correctly re-report
            # fallback_occurred) rather than needing to re-discover the
            # fallback every time.
            await extraction_cache.store_extraction(image_hash, f'{effective_provider}:{model_name}', result)
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

    return await apply_auto_insert(
        result, auto_insert=auto_insert, current_user=current_user,
        content=content, content_type=ticket_image.content_type,
    )


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
        'populated, rather than expecting a TMDB match bundled here. Same `auto_insert` '
        'behavior as `/extract` too, with one difference: there\'s no image here (the '
        'extraction comes from scraped page text), so an auto-inserted log from this '
        'endpoint has no `ticket_image_path` — same as any other manually-typed log.'
    ),
    response_description='Movie Metadata',
    response_model=MovieMetadataResult,
    responses=responses['extract-from-link'],
    operation_id='ExtractFromTicketLink',
)
@limiter.limit(f'{settings.rate_limit_per_minute}/minute')
async def extract_movie_metadata_from_link(
    request: Request,
    body: TicketLinkRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    provider: Optional[Provider] = None,
    model: str | None = None,
    auto_fallback: bool = False,
    auto_insert: Optional[bool] = None,
    header_api_key: str | None = Depends(get_header_api_key),
) -> MovieMetadataResult:
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
    effective_provider, model_name = await resolve_provider_and_model(
        provider, model, current_user, requires_image=False
    )

    # Same authorization gate /extract uses, same reason — see
    # ensure_provider_authorized's docstring.
    await ensure_provider_authorized(effective_provider, header_api_key, current_user)

    # Same content-addressed cache extract_movie_metadata() uses, keyed
    # by a hash of the scraped text plus provider/model instead of image
    # bytes — same reuse logic applies: identical page content + same
    # provider/model always produces the same extraction. Same ordering
    # rule as /extract: this happens *before* resolve_llm_api_key (where
    # quota gets touched), never after — a cache hit must never cost
    # anything real.
    content_hash = hashlib.sha256(page_text.encode('utf-8')).hexdigest()
    cached = await extraction_cache.get_cached_extraction(content_hash, f'{effective_provider}:{model_name}')
    if cached is not None:
        LOGGER.info(
            'extract-from-link rid={} provider={} model={} cache=hit',
            getattr(request.state, 'request_id', '-'), effective_provider, model_name,
        )
        result = cached
    else:
        llm_api_key = await resolve_llm_api_key(effective_provider, model_name, header_api_key, current_user)

        try:
            ticket: MovieMetadata
            used_model: str
            ticket, used_model = await extract_movie_metadata_from_text(
                page_text=page_text,
                api_key=llm_api_key,
                system_prompt=movie_metadata.SYSTEM_PROMPT_TEXT,
                user_prompt=movie_metadata.USER_PROMPT_TEXT,
                response_model=MovieMetadata,
                model_name=model_name,
                provider=effective_provider,
                auto_fallback=auto_fallback,
            )
            LOGGER.info(
                'extract-from-link rid={} provider={} model={} used_model={} cache=miss',
                getattr(request.state, 'request_id', '-'), effective_provider, model_name, used_model,
            )
            final = MovieMetadataResult(
                **ticket.model_dump(),
                used_provider=effective_provider,
                used_model=used_model,
                requested_model=model_name,
                fallback_occurred=used_model != model_name,
            )
            result = final.model_dump()
            await extraction_cache.store_extraction(content_hash, f'{effective_provider}:{model_name}', result)
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

    return await apply_auto_insert(
        result, auto_insert=auto_insert, current_user=current_user,
        content=None, content_type=None,
    )


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
