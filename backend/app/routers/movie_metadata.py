import os

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.security import APIKeyHeader
from llm.openrouter_client import extract_movie_metadata_from_image
from llm.prompts import movie_metadata
from loguru_setup import LOGGER
from pydantic import ValidationError
from responses.movie_metadata import responses
from schemas.movie_metadata import MovieMetadata
from utils import image

router = APIRouter()

openrouter_api_key_header = APIKeyHeader(name='X-OpenRouter-API-Key', auto_error=False)


def get_api_key(api_key: str = Depends(openrouter_api_key_header)):
    if api_key:
        return api_key
    api_key = os.getenv('OPENROUTER_API_KEY')
    if not api_key:
        raise HTTPException(status_code=500, detail='API key not configured')
    return api_key


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
    operation_id="ExtractTicketImage",
)
async def extract_movie_metadata(
    file: UploadFile = File(
        ...,
        description="Ticket image (JPEG, PNG, or WebP)",
        media_type="image/*",
    ),
    openrouter_api_key: str = Depends(get_api_key),
) -> MovieMetadata:
    if file.content_type not in {'image/jpeg', 'image/jpg', 'image/png', 'image/webp'}:
        raise HTTPException(
            400, "Invalid file type: only JPEG, JPG, PNG, or WebP allowed"
        )

    try:
        image_data_uri = await image.image_to_data_uri(file)
    except Exception as e:
        LOGGER.error(f'Failed to read uploaded file: {e}')
        raise HTTPException(status_code=400, detail='Invalid image file')

    try:
        ticket: MovieMetadata = extract_movie_metadata_from_image(
            image_data_uri=image_data_uri,
            api_key=openrouter_api_key,
            system_prompt=movie_metadata.SYSTEM_PROMPT,
            user_prompt=movie_metadata.USER_PROMPT,
            response_model=MovieMetadata,
        )
        LOGGER.info('Movie metadata extracted successfully.')
        return ticket.model_dump()
    except ValidationError as e:
        LOGGER.error(f'Validation error parsing movie metadata: {e}')
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail='Failed to parse movie metadata from response',
        )
    except Exception as e:
        LOGGER.error(f'Error during movie metadata extraction: {e}')
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail='Movie metadata extraction failed',
        )
