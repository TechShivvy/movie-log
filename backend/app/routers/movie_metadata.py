from config import settings
from auth.supabase_auth import AuthenticatedUser, get_current_user
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, status
from fastapi import Form
from fastapi.security import APIKeyHeader
from llm.openrouter_client import extract_movie_metadata_from_image
from llm.prompts import movie_metadata
from loguru_setup import LOGGER
from openai import OpenAIError
from pydantic import ValidationError
from responses.movie_metadata import responses
from schemas.movie_metadata import MovieMetadata
from starlette.formparsers import MultiPartParser
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


def resolve_model_name(model: str | None) -> str:
    selected_model = (model or settings.default_free_model).strip()
    if not selected_model:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='Model must not be empty.',
        )
    return selected_model


def validate_shared_model(model_name: str) -> None:
    allowed_models = set(settings.free_models)
    # If an explicit allowlist is configured, trust it as the source of truth.
    if allowed_models:
        if model_name not in allowed_models:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail='Selected model is not allowed for shared usage.',
            )
        return

    if not model_name.endswith(':free'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='Selected shared model must be a free model.',
        )


@router.post(
    path='/extract',
    tags=['Extract Movie Metadata'],
    description=(
        'Extract movie metadata from an uploaded ticket image.\n\n'
        'To use this endpoint, please follow these steps:\n\n'
        '1. **Create your own OpenRouter API key**:\n'
        '   - Visit [https://openrouter.ai/settings/keys](https://openrouter.ai/settings/keys).\n'
        '   - Click on "Create Key".\n'
        '   - Provide a descriptive name for the key.\n'
        '   - Click "Create" to generate the key.\n\n'
        '2. **Authenticate using your API key**:\n'
        '   - In the Swagger UI, click on the "Authorize" button located at the top right corner.\n'
        '   - Enter your API key in the "Value" field and click "Authorize".\n\n'
        'Your API key will be used to authenticate requests to this endpoint.'
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

    model_name = resolve_model_name(model)

    if header_api_key:
        openrouter_api_key = header_api_key
    else:
        validate_shared_model(model_name)
        await ensure_within_daily_quota(current_user.user_id)
        openrouter_api_key = resolve_shared_api_key()

    try:
        image_data_uri = await image.image_to_data_uri(ticket_image)
    except Exception as e:
        LOGGER.error(f'Failed to read uploaded file: {e}')
        raise HTTPException(status_code=400, detail='Invalid image file')

    _llm_start = __import__('time').monotonic()
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
            'extract rid={} model={} duration={:.3f}s',
            getattr(request.state, 'request_id', '-'),
            model_name,
            __import__('time').monotonic() - _llm_start,
        )
        return ticket.model_dump()
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
