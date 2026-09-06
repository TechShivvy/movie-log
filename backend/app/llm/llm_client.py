import asyncio
import re
import time
from typing import Any, Optional

import httpx
from config import settings
from loguru_setup import LOGGER
from openai import (
    AsyncOpenAI,
    AuthenticationError,
    BadRequestError,
    NotFoundError,
    OpenAIError,
    PermissionDeniedError,
)
from pydantic import ValidationError
from utils import openai_utils, retry
from utils.timing import timed

_META_TIMEOUT = 10.0

# Renamed from openrouter_client.py — generalized to drive OpenRouter,
# OpenAI, and Gemini through the same AsyncOpenAI client, varying only
# base_url/api_key. Gemini is reached via its OpenAI-compatible endpoint
# rather than a native SDK — live-verified (see plan.md) as full parity
# on latency and structured-output support, and Google's own native
# generateContent is itself mid-migration to a different API shape right
# now, so betting on "native" wasn't actually the more stable choice.
# This shape is also what a future LiteLLM swap would present to callers
# anyway, so unifying here isn't throwaway work.
class ProviderConfig:
    __slots__ = ('base_url', 'display_name', 'supports_shared_key')

    def __init__(self, base_url: Optional[str], display_name: str, supports_shared_key: bool):
        self.base_url = base_url
        self.display_name = display_name
        self.supports_shared_key = supports_shared_key


PROVIDERS: dict[str, ProviderConfig] = {
    'openrouter': ProviderConfig(
        base_url='https://openrouter.ai/api/v1',
        display_name='OpenRouter',
        supports_shared_key=True,
    ),
    'openai': ProviderConfig(
        base_url=None,  # SDK default (api.openai.com)
        display_name='OpenAI',
        supports_shared_key=False,
    ),
    'gemini': ProviderConfig(
        base_url='https://generativelanguage.googleapis.com/v1beta/openai/',
        display_name='Gemini',
        supports_shared_key=False,
    ),
}


def _client_for(provider: str, api_key: str) -> AsyncOpenAI:
    config = PROVIDERS[provider]
    if config.base_url:
        return AsyncOpenAI(base_url=config.base_url, api_key=api_key)
    return AsyncOpenAI(api_key=api_key)


# In-memory cache of OpenRouter's GET /api/v1/models — OpenRouter-only,
# it's the one provider with a free, no-auth, rich public catalog
# (pricing, modality, context length). OpenAI/Gemini have no equivalent
# public source — their check_model() branch below authenticates instead
# (see check_model), returning less metadata by necessity, not oversight.
_MODELS_CACHE_TTL = 3600.0
_models_cache: dict[str, Any] = {'fetched_at': 0.0, 'by_id': {}}


async def _openrouter_models() -> dict[str, dict[str, Any]]:
    now = time.monotonic()
    if now - _models_cache['fetched_at'] < _MODELS_CACHE_TTL and _models_cache['by_id']:
        return _models_cache['by_id']

    async with httpx.AsyncClient(timeout=_META_TIMEOUT) as client:
        response = await client.get('https://openrouter.ai/api/v1/models')
    response.raise_for_status()
    by_id = {m['id']: m for m in response.json().get('data', [])}
    _models_cache['by_id'] = by_id
    _models_cache['fetched_at'] = now
    return by_id


async def check_api_key(provider: str, api_key: str) -> dict[str, Any]:
    """Validate a key for the given provider without spending tokens/credits.

    OpenRouter: GET /api/v1/key, a metadata lookup only (existing
    behavior, unchanged). OpenAI/Gemini: client.models.list() via the
    same AsyncOpenAI client extraction uses — listing models is a
    metadata call on both, no completion/generation involved.
    """

    if provider == 'openrouter':
        async with httpx.AsyncClient(timeout=_META_TIMEOUT) as client:
            response = await client.get(
                'https://openrouter.ai/api/v1/key',
                headers={'Authorization': f'Bearer {api_key}'},
            )
        if response.status_code == 401:
            return {'valid': False}
        response.raise_for_status()
        data = response.json().get('data', {})
        return {
            'valid': True,
            'is_free_tier': data.get('is_free_tier'),
            'usage': data.get('usage'),
            'limit': data.get('limit'),
            'limit_remaining': data.get('limit_remaining'),
        }

    client = _client_for(provider, api_key)
    try:
        await client.models.list()
        return {'valid': True}
    except (AuthenticationError, BadRequestError, PermissionDeniedError):
        # A malformed/garbage key doesn't uniformly come back as 401
        # across providers — found live: Gemini rejects an obviously
        # invalid key with 400 INVALID_ARGUMENT ("Please pass a valid
        # API key"), not 401. Treating BadRequestError/PermissionDeniedError
        # as "invalid key" too, alongside AuthenticationError, covers
        # that without swallowing genuinely unexpected errors (5xx,
        # connection failures) — those still propagate to the caller.
        return {'valid': False}


async def check_model(
    provider: str, model_name: str, api_key: Optional[str] = None
) -> Optional[dict[str, Any]]:
    """Look up a model for the given provider. OpenRouter: free, no-auth,
    rich catalog lookup (existing behavior, unchanged) — returns
    modality/pricing/context-length. OpenAI/Gemini: neither exposes a
    public no-auth catalog the same way, so this authenticates
    (client.models.retrieve) and returns only existence — real metadata
    parity isn't available generically for these two, not hidden here.
    Returns None if the model doesn't exist (or, for OpenAI/Gemini, if no
    api_key was given to check with)."""

    if provider == 'openrouter':
        models = await _openrouter_models()
        model = models.get(model_name)
        if model is None:
            return None
        architecture = model.get('architecture') or {}
        pricing = model.get('pricing') or {}
        return {
            'exists': True,
            'name': model.get('name'),
            'input_modalities': architecture.get('input_modalities', []),
            'supports_image_input': 'image' in architecture.get('input_modalities', []),
            'is_free': pricing.get('prompt') == '0' and pricing.get('completion') == '0',
            'context_length': model.get('context_length'),
        }

    if not api_key:
        return None
    client = _client_for(provider, api_key)
    try:
        model = await client.models.retrieve(model_name)
        return {'exists': True, 'name': getattr(model, 'id', model_name)}
    except NotFoundError:
        return None


def _build_image_messages(system_prompt: str, user_prompt: str, image_data_uri: str) -> list[dict]:
    return [
        {'role': 'system', 'content': system_prompt},
        {
            'role': 'user',
            'content': [
                {'type': 'text', 'text': user_prompt},
                {'type': 'image_url', 'image_url': {'url': image_data_uri}},
            ],
        },
    ]


def _build_text_messages(system_prompt: str, user_prompt: str, page_text: str) -> list[dict]:
    return [
        {'role': 'system', 'content': system_prompt},
        {'role': 'user', 'content': f'{user_prompt}\n\n---\nExtracted page content:\n{page_text}'},
    ]


async def _call_model(
    client,
    messages: list[dict],
    response_model,
    model_name: str,
):
    """Call the model with a prebuilt messages list (image or text, built
    by _build_image_messages/_build_text_messages) — the parse/fallback
    logic below is identical either way.

    Args:
        client (_type_): The OpenAI client
        messages (list[dict]): The chat messages to send
        response_model (_type_): The response model (Pydantic model)
        model_name (str): The model name

    Returns:
        response_model: The model response which is a Pydantic model instance (response_model)
    """

    try:
        response = await client.beta.chat.completions.parse(
            model=model_name,
            messages=messages,
            response_format=response_model,
        )
        LOGGER.debug(f'API response parsed successfully: {response}')
        return response.choices[0].message.parsed
    except (ValidationError, TypeError, IndexError, AttributeError) as exc:
        LOGGER.warning(
            f'Structured parse unavailable for model {model_name}; falling back to JSON mode. Error: {exc}'
        )

    fallback = await client.chat.completions.create(
        model=model_name,
        messages=messages,
        response_format={'type': 'json_object'},
    )

    choices = fallback.choices or []
    if not choices or not choices[0].message:
        raise ValueError('Model returned no completion choices')

    content = choices[0].message.content
    if isinstance(content, list):
        text_chunks = []
        for part in content:
            if isinstance(part, dict) and part.get('type') == 'text':
                text_chunks.append(part.get('text', ''))
        content_text = ''.join(text_chunks).strip()
    else:
        content_text = (content or '').strip()

    if not content_text:
        raise ValueError('Model returned empty response content')

    # Some providers may still wrap JSON in fences despite JSON mode.
    content_text = re.sub(r'^```(?:json)?\s*|\s*```$', '', content_text).strip()

    # If the provider prepends text, try extracting the first JSON object.
    if not content_text.startswith('{'):
        json_match = re.search(r'\{[\s\S]*\}', content_text)
        if json_match:
            content_text = json_match.group(0)

    return response_model.model_validate_json(content_text)


_OPENAI_FALLBACK_MODEL = 'gpt-4o-mini'


async def _fallback_model_for(provider: str, *, requires_image: bool = True) -> str:
    """The 'next best available model' auto_fallback retries against —
    the same per-provider suggested/free default routers/movie_metadata.py
    already falls back to when `model` is omitted entirely (see that
    module's default_model_for), duplicated here rather than imported
    from a router to keep the dependency direction services -> llm, not
    llm -> router."""

    from services import free_models, gemini_free_models

    if provider == 'openrouter':
        return await free_models.default_free_model(requires_image=requires_image)
    if provider == 'gemini':
        return await gemini_free_models.default_free_model()
    return _OPENAI_FALLBACK_MODEL


@timed(label='extract_movie_metadata_from_image')
async def extract_movie_metadata_from_image(
    image_data_uri: str,
    api_key: str,
    system_prompt: str,
    user_prompt: str,
    response_model,
    model_name: str = 'qwen/qwen2.5-vl-72b-instruct:free',
    provider: str = 'openrouter',
    auto_fallback: bool = False,
):
    """Extract movie metadata from an image via the given provider.

    Args:
        image_data_uri (str): The data URI of the image to analyze
        api_key (str): The API key for authentication
        system_prompt (str): The system prompt to guide the model
        user_prompt (str): The user prompt with specific questions
        response_model (_type_): The expected response model
        model_name (str, optional): The name of the model to use.
        provider (str, optional): 'openrouter' (default), 'openai', or 'gemini'.
        auto_fallback (bool, optional): opt-in — if the requested model
            404s as not-found, retry once against that provider's
            default/suggested model instead of failing. Off by default:
            a request never silently changes models unless explicitly
            opted in. Applies to all three providers alike (previously
            Gemini alone always did this unconditionally — that
            always-on special case is gone, this flag is what triggers
            it now, for any provider).

    Raises:
        openai_error_to_http: If the OpenAI API returns an error
        http_exc: If there is an HTTP error

    Returns:
        tuple[response_model, str]: the extracted movie metadata (a
        response_model instance) and the model name that actually
        produced it — differs from the `model_name` argument only when
        auto_fallback fired.
    """

    client = _client_for(provider, api_key)
    fell_back_once = False

    for attempt in range(1, settings.max_attempts + 1):
        LOGGER.info(f'Calling model (attempt {attempt}/{settings.max_attempts}) provider={provider}')

        try:
            result = await _call_model(
                client,
                _build_image_messages(system_prompt, user_prompt, image_data_uri),
                response_model,
                model_name,
            )
            return result, model_name

        except NotFoundError as exc:
            # Opt-in, one retry, only for a genuine "model not found" —
            # never more than once, never for any other error shape. See
            # this function's own auto_fallback docstring.
            if auto_fallback and not fell_back_once:
                fell_back_once = True
                old_model = model_name
                model_name = await _fallback_model_for(provider)
                LOGGER.warning(
                    '{} model {} not found, falling back to {} and retrying once',
                    provider, old_model, model_name,
                )
                continue
            raise openai_utils.openai_error_to_http(exc)

        except BadRequestError as exc:
            LOGGER.warning(f'BadRequestError: {exc}')
            # only shrink image on context errors
            if openai_utils.is_context_error(exc):
                image_data_uri = retry.shrink_or_fail(
                    image_data_uri, attempt, settings.max_attempts
                )
                continue

            raise openai_utils.openai_error_to_http(exc)

        except OpenAIError as exc:
            http_exc = openai_utils.openai_error_to_http(exc)

            # Don't retry 4xx errors
            if http_exc.status_code < 500:
                raise http_exc

            LOGGER.warning(f'Retryable OpenAIError on attempt {attempt}: {exc}')

            if attempt == settings.max_attempts:
                LOGGER.error('Model call failed after all retries')
                raise http_exc

            sleep_duration = retry.calculate_backoff(attempt)
            LOGGER.info(f'Retrying after {sleep_duration:.1f}s')
            await asyncio.sleep(sleep_duration)

        except (
            ValidationError,
            TypeError,
            ValueError,
            IndexError,
            AttributeError,
        ) as exc:
            LOGGER.warning(
                f'Failed to parse model response on attempt {attempt}/{settings.max_attempts}: {exc}'
            )

            if attempt == settings.max_attempts:
                LOGGER.error('Model response could not be parsed after all retries')
                raise RuntimeError(
                    'Failed to parse model response as MovieMetadata'
                ) from exc

            sleep_duration = retry.calculate_backoff(attempt)
            LOGGER.info(f'Retrying after {sleep_duration:.1f}s')
            await asyncio.sleep(sleep_duration)


@timed(label='extract_movie_metadata_from_text')
async def extract_movie_metadata_from_text(
    page_text: str,
    api_key: str,
    system_prompt: str,
    user_prompt: str,
    response_model,
    model_name: str = 'qwen/qwen2.5-vl-72b-instruct:free',
    provider: str = 'openrouter',
    auto_fallback: bool = False,
):
    """Extract movie metadata from scraped ticket-page text (see
    services/ticket_link_extractor.py) via the given provider — the text
    equivalent of extract_movie_metadata_from_image, same retry structure,
    same response_model/parsing path via _call_model, same opt-in
    auto_fallback behavior (see that function's docstring), differing
    only in how the message is built (_build_text_messages, no image_url)
    and how a context-length error is handled (truncate text, not shrink
    image).

    Unlike the image path, this doesn't require an image-capable model —
    plain text input works with any model on any of the three providers,
    free or not, so callers aren't restricted to the image-capable subset
    of the free model list the way /extract is (OpenRouter path only) —
    also true of the auto_fallback retry target here (requires_image=False).

    Args:
        page_text (str): The extracted visible text of the ticket page
        api_key (str): The API key for authentication
        system_prompt (str): The system prompt to guide the model
        user_prompt (str): The user prompt with specific questions
        response_model (_type_): The expected response model
        model_name (str, optional): The name of the model to use
        provider (str, optional): 'openrouter' (default), 'openai', or 'gemini'.
        auto_fallback (bool, optional): see extract_movie_metadata_from_image.

    Returns:
        tuple[response_model, str]: the extracted movie metadata and the
        model name that actually produced it — see
        extract_movie_metadata_from_image.
    """

    client = _client_for(provider, api_key)
    fell_back_once = False

    for attempt in range(1, settings.max_attempts + 1):
        LOGGER.info(f'Calling model (attempt {attempt}/{settings.max_attempts}) provider={provider}')

        try:
            result = await _call_model(
                client,
                _build_text_messages(system_prompt, user_prompt, page_text),
                response_model,
                model_name,
            )
            return result, model_name

        except NotFoundError as exc:
            if auto_fallback and not fell_back_once:
                fell_back_once = True
                old_model = model_name
                model_name = await _fallback_model_for(provider, requires_image=False)
                LOGGER.warning(
                    '{} model {} not found, falling back to {} and retrying once',
                    provider, old_model, model_name,
                )
                continue
            raise openai_utils.openai_error_to_http(exc)

        except BadRequestError as exc:
            LOGGER.warning(f'BadRequestError: {exc}')
            if openai_utils.is_context_error(exc):
                page_text = retry.truncate_or_fail(page_text, attempt, settings.max_attempts)
                continue

            raise openai_utils.openai_error_to_http(exc)

        except OpenAIError as exc:
            http_exc = openai_utils.openai_error_to_http(exc)

            if http_exc.status_code < 500:
                raise http_exc

            LOGGER.warning(f'Retryable OpenAIError on attempt {attempt}: {exc}')

            if attempt == settings.max_attempts:
                LOGGER.error('Model call failed after all retries')
                raise http_exc

            sleep_duration = retry.calculate_backoff(attempt)
            LOGGER.info(f'Retrying after {sleep_duration:.1f}s')
            await asyncio.sleep(sleep_duration)

        except (
            ValidationError,
            TypeError,
            ValueError,
            IndexError,
            AttributeError,
        ) as exc:
            LOGGER.warning(
                f'Failed to parse model response on attempt {attempt}/{settings.max_attempts}: {exc}'
            )

            if attempt == settings.max_attempts:
                LOGGER.error('Model response could not be parsed after all retries')
                raise RuntimeError(
                    'Failed to parse model response as MovieMetadata'
                ) from exc

            sleep_duration = retry.calculate_backoff(attempt)
            LOGGER.info(f'Retrying after {sleep_duration:.1f}s')
            await asyncio.sleep(sleep_duration)
