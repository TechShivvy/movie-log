import asyncio
import re

from config import settings
from loguru_setup import LOGGER
from openai import (
    AsyncOpenAI,
    BadRequestError,
    OpenAIError,
)
from pydantic import ValidationError
from utils import openai_utils, retry


async def _call_model(
    client,
    image_data_uri: str,
    system_prompt: str,
    user_prompt: str,
    response_model,
    model_name: str,
):
    """Call the model with the given parameters

    Args:
        client (_type_): The OpenAI client
        image_data_uri (str): The image data URI
        system_prompt (str): The system prompt
        user_prompt (str): The user prompt
        response_model (_type_): The response model (Pydantic model)
        model_name (str): The model name

    Returns:
        response_model: The model response which is a Pydantic model instance (response_model)
    """

    messages = [
        {'role': 'system', 'content': system_prompt},
        {
            'role': 'user',
            'content': [
                {'type': 'text', 'text': user_prompt},
                {'type': 'image_url', 'image_url': {'url': image_data_uri}},
            ],
        },
    ]

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
                image_data_uri,
                system_prompt,
                user_prompt,
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
