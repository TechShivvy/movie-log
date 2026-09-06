import base64
import hashlib
import io
from typing import Annotated

from config import settings
from fastapi import File, Header, HTTPException, UploadFile, status
from magic import Magic
from PIL import Image

mime = Magic(mime=True)

# Guard against decompression-bomb images (e.g. tiny file, enormous pixel count).
Image.MAX_IMAGE_PIXELS = 50_000_000  # ~50 MP

# Only raster formats the vision model accepts. SVG and other 'image/*' types
# (which magic would otherwise pass) are rejected here as defense in depth.
ALLOWED_IMAGE_MIME_TYPES = {'image/jpeg', 'image/png', 'image/webp'}


async def hash_upload(file: UploadFile) -> str:
    """SHA-256 of the raw upload — used as a content-addressed cache key
    (services/extraction_cache.py). Hashes bytes, not the filename: two
    different filenames can be the exact same image, and the same
    filename can be a completely different one, so the filename is never
    a reliable signal on its own. Seeks back to the start afterward so a
    later image_to_data_uri() call on the same UploadFile still reads the
    full content, same re-read pattern validate_image_file already uses.
    """

    contents = await file.read()
    await file.seek(0)
    return hashlib.sha256(contents).hexdigest()


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
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail=f'Ticket image must be smaller than {settings.max_file_size} MB',
        )


def detect_image_mime(chunk: bytes) -> str:
    """Sniffs the real content type from raw bytes via libmagic — the
    single source of truth both validate_image_file (the single-upload
    dependency below) and the batch endpoint's per-item validation
    (routers/movie_metadata_batch.py) call into, so the two paths can
    never drift on what counts as an acceptable image. Returns the
    detected mime type; raises nothing itself — callers decide how to
    react (validate_image_file turns a bad type into a 415 for the whole
    request; the batch loop turns it into one failed item, not a
    whole-batch rejection)."""

    return mime.from_buffer(chunk)


def hash_bytes(content: bytes) -> str:
    """Same content-addressed cache key as hash_upload, for a caller that
    already has the raw bytes in hand (e.g. the batch endpoint, which
    reads every image once up front rather than re-reading each
    UploadFile from a background task after the request has ended)."""

    return hashlib.sha256(content).hexdigest()


def bytes_to_data_uri(content: bytes, content_type: str) -> str:
    """Same shape as image_to_data_uri, for a caller that already has the
    raw bytes in hand — see hash_bytes."""

    encoded = base64.b64encode(content).decode('utf-8')
    return f'data:{content_type};base64,{encoded}'


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
    detected = detect_image_mime(chunk)
    await ticket_image.seek(0)
    if detected not in ALLOWED_IMAGE_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f'Invalid file type: detected {detected}. Only JPEG, PNG or WebP allowed.',
        )

    return ticket_image


def optimize_image_data_uri(
    image_data_uri: str,
    max_size: int = 800,
    quality: int = 80,
    method: int = 3,
    lossless_webp: bool = False,
) -> str:
    """
    Downscale & compress, preserving original MIME. Supports JPEG, PNG, WebP.
    """
    header, b64 = image_data_uri.split(',', 1)
    mime = header.split(';')[0].split(':', 1)[1]  # e.g. image/jpeg or image/webp

    img = Image.open(io.BytesIO(base64.b64decode(b64)))
    img.thumbnail((max_size, max_size), Image.LANCZOS)
    buf = io.BytesIO()

    fmt = None
    save_kwargs = {'optimize': True}
    if mime.lower() in ('image/jpeg', 'image/jpg'):
        fmt = 'JPEG'
        save_kwargs['quality'] = quality
    elif mime.lower() == 'image/webp':
        fmt = 'WEBP'
        if lossless_webp:
            save_kwargs['lossless'] = True
        else:
            save_kwargs['quality'] = quality
            save_kwargs['method'] = method
    elif mime.lower() == 'image/png':
        fmt = img.format or 'PNG'

    img = img.convert('RGB') if fmt in ('JPEG', 'WEBP') else img
    img.save(buf, format=fmt, **save_kwargs)
    encoded = base64.b64encode(buf.getvalue()).decode('utf-8')
    return f'data:{mime};base64,{encoded}'
