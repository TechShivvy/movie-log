import asyncio
import re
import time
from typing import Any, Optional

import httpx
from config import settings
from loguru_setup import LOGGER
from openai import (
    AsyncOpenAI,
    BadRequestError,
    OpenAIError,
)
from pydantic import ValidationError
from utils import openai_utils, retry
from utils.timing import timed

_META_TIMEOUT = 10.0

# In-memory cache of GET /api/v1/models — used to answer "does this model
# exist / does it accept image input" without a live fetch on every
# test-key call. Not the same list PROMPT_VERSION-style free-model
# validation uses (services/free_models.py) — that one's the free-only
# subset, refreshed out-of-band via GitHub Actions specifically because
# it's checked on every /extract call and needs to be fast/local. This
# one covers *every* model (a user's own key may use a paid one), and
# "test my key" should reflect OpenRouter's real catalog right now, not a
# day-old snapshot, so it's a short-lived cache, not a persisted one.
_MODELS_CACHE_TTL = 3600.0
_models_cache: dict[str, Any] = {'fetched_at': 0.0, 'by_id': {}}


async def _all_models() -> dict[str, dict[str, Any]]:
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


async def check_api_key(api_key: str) -> dict[str, Any]:
    """Validate an OpenRouter key via GET /api/v1/key — a metadata lookup
    only, costs no tokens/credits regardless of whether the key is valid."""

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


async def check_model(model_name: str) -> Optional[dict[str, Any]]:
    """Look up a model in OpenRouter's public catalog — also a metadata
    lookup, no tokens spent, no API key needed at all for this one.
    Returns None if the model id doesn't exist."""

    models = await _all_models()
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


@timed(label='extract_movie_metadata_from_image')
async def extract_movie_metadata_from_image(
    image_data_uri: str,
    api_key: str,
    system_prompt: str,
    user_prompt: str,
    response_model,
    model_name: str = 'qwen/qwen2.5-vl-72b-instruct:free',
):
    """Extract movie metadata from an image using OpenRouter API

    Args:
        image_data_uri (str): The data URI of the image to analyze
        api_key (str): The API key for authentication
        system_prompt (str): The system prompt to guide the model
        user_prompt (str): The user prompt with specific questions
        response_model (_type_): The expected response model
        model_name (str, optional): The name of the model to use. Defaults to 'qwen/qwen2.5-vl-72b-instruct:free'

    Raises:
        openai_error_to_http: If the OpenAI API returns an error
        http_exc: If there is an HTTP error

    Returns:
        response_model: The extracted movie metadata as a Pydantic model instance (response_model)
    """

    client = AsyncOpenAI(base_url='https://openrouter.ai/api/v1', api_key=api_key)

    for attempt in range(1, settings.max_attempts + 1):
        LOGGER.info(f'Calling model (attempt {attempt}/{settings.max_attempts})')

        try:
            return await _call_model(
                client,
                _build_image_messages(system_prompt, user_prompt, image_data_uri),
                response_model,
                model_name,
            )

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
):
    """Extract movie metadata from scraped ticket-page text (see
    services/ticket_link_extractor.py) using OpenRouter API — the text
    equivalent of extract_movie_metadata_from_image, same retry structure,
    same response_model/parsing path via _call_model, differing only in
    how the message is built (_build_text_messages, no image_url) and how
    a context-length error is handled (truncate text, not shrink image).

    Unlike the image path, this doesn't require an image-capable model —
    plain text input works with any OpenRouter model, free or not, so
    callers aren't restricted to the image-capable subset of the free
    model list the way /extract is.

    Args:
        page_text (str): The extracted visible text of the ticket page
        api_key (str): The API key for authentication
        system_prompt (str): The system prompt to guide the model
        user_prompt (str): The user prompt with specific questions
        response_model (_type_): The expected response model
        model_name (str, optional): The name of the model to use

    Returns:
        response_model: The extracted movie metadata as a Pydantic model instance (response_model)
    """

    client = AsyncOpenAI(base_url='https://openrouter.ai/api/v1', api_key=api_key)

    for attempt in range(1, settings.max_attempts + 1):
        LOGGER.info(f'Calling model (attempt {attempt}/{settings.max_attempts})')

        try:
            return await _call_model(
                client,
                _build_text_messages(system_prompt, user_prompt, page_text),
                response_model,
                model_name,
            )

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
