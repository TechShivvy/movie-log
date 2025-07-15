import base64

from fastapi import UploadFile


async def image_to_data_uri(file: UploadFile) -> str:
    """
    Reads the uploaded image asynchronously and returns a data URI.
    """

    contents = await file.read()
    encoded = base64.b64encode(contents).decode('utf-8')
    return f'data:{file.content_type};base64,{encoded}'
