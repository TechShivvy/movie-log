from typing import Annotated

import magic
from config import settings
from fastapi import APIRouter, Depends, File, Header, HTTPException, UploadFile, status
from fastapi.security import APIKeyHeader
from llm.openrouter_client import extract_movie_metadata_from_image
from llm.prompts import movie_metadata
from loguru_setup import LOGGER
from pydantic import ValidationError
from responses.movie_metadata import responses
from schemas.movie_metadata import MovieMetadata
from starlette.formparsers import MultiPartParser
from utils import image

mime = magic.Magic(mime=True)

MultiPartParser.max_part_size = settings.max_part_size * 1024 * 1024
# To keep the file in memory, loads and processes it very quickly.
MultiPartParser.spool_max_size = settings.spool_max_size * 1024 * 1024

router = APIRouter()

openrouter_api_key_header = APIKeyHeader(name='X-OpenRouter-API-Key', auto_error=False)


def get_api_key(api_key: str = Depends(openrouter_api_key_header)) -> str:
    if api_key:
        return api_key
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


async def validate_content_length(
    content_length: Annotated[
        int | None,
        Header(
            description=f'Ticket image size in bytes (must be ≤ {settings.max_file_size} MB)',
        ),
    ] = None,
) -> None:
    limit = settings.max_file_size * 1024 * 1024
    if content_length is not None and content_length >= limit:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f'Ticket image must be smaller than {settings.max_file_size} MB',
        )


async def validate_image_file(
    ticket_image: Annotated[
        UploadFile,
        File(
            ...,
            description='Upload a movie ticket (JPEG, PNG, or WebP) image to extract metadata',
            media_type='image/*',
        ),
    ],
) -> UploadFile:
    chunk = await ticket_image.read(1024)
    detected = mime.from_buffer(chunk)
    await ticket_image.seek(0)
    if not detected.startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f'Invalid file type: detected {detected}. Only images allowed.',
        )
    return ticket_image


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
async def extract_movie_metadata(
    ticket_image: UploadFile = Depends(validate_image_file),
    _cl: None = Depends(validate_content_length),
    openrouter_api_key: str = Depends(get_api_key),
) -> MovieMetadata:
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

    try:
        image_data_uri = await image.image_to_data_uri(ticket_image)
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
