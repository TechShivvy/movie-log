import base64
from typing import Annotated

from config import settings
from fastapi import File, Header, HTTPException, UploadFile, status
from magic import Magic


mime = Magic(mime=True)


async def image_to_data_uri(file: UploadFile) -> str:
    """
    Reads the uploaded image asynchronously and returns a data URI.
    """

    contents = await file.read()
    encoded = base64.b64encode(contents).decode('utf-8')
    return f'data:{file.content_type};base64,{encoded}'


async def validate_content_length(
    content_length: Annotated[
        int | None,
        Header(
            description=f'Ticket image size in bytes (must be ≤ {settings.max_file_size} MB)',
        ),
    ] = None,
) -> None:
    """
    Validate the content length of the uploaded image file.

    Args:
        content_length (Annotated[ int  |  None, Header, optional): The size of the uploaded image file in bytes. Defaults to f'Ticket image size in bytes (must be ≤ {settings.max_file_size} MB)', ), ]=None.

    Raises:
        HTTPException: If the content length exceeds the maximum file size.
    """
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
    """Validate the content type of the uploaded image file.

    Args:
        ticket_image (Annotated[ UploadFile, File(...), ]): The uploaded image file.

    Raises:
        HTTPException: If the content type is not a supported image type.

    Returns:
        UploadFile: The validated image file.
    """

    chunk = await ticket_image.read(1024)
    detected = mime.from_buffer(chunk)
    await ticket_image.seek(0)
    if not detected.startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f'Invalid file type: detected {detected}. Only images allowed.',
        )

    return ticket_image
