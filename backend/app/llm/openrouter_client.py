from openai import AsyncOpenAI


async def extract_movie_metadata_from_image(
    image_data_uri: str,
    api_key: str,
    system_prompt: str,
    user_prompt: str,
    response_model,
    model_name: str = 'qwen/qwen2.5-vl-72b-instruct:free',
):
    client = AsyncOpenAI(base_url='https://openrouter.ai/api/v1', api_key=api_key)
    response = await client.beta.chat.completions.parse(
        model=model_name,
        messages=[
            {'role': 'system', 'content': system_prompt},
            {
                'role': 'user',
                'content': [
                    {'type': 'text', 'text': user_prompt},
                    {
                        'type': 'image_url',
                        'image_url': {'url': image_data_uri},
                    },
                ],
            },
        ],
        response_format=response_model,
    )
    return response.choices[0].message.parsed


# import io, base64, logging
# from PIL import Image
# from tenacity import (
#     retry,
#     stop_after_attempt,
#     wait_exponential,
#     retry_if_exception_type,
#     before_sleep_log,
#     RetryCallState,
# )
# from openai import OpenAI, BadRequestError, RateLimitError, APIError
# from pydantic import ValidationError

# logger = logging.getLogger(__name__)
# logging.basicConfig(level=logging.INFO)

# client = OpenAI(api_key=OPENROUTER_API_KEY)


# def optimized_img_to_data_url(
#     path: str, max_size: int = 800, quality: int = 80, fmt: str = "JPEG"
# ) -> str:
#     img = Image.open(path)
#     img.thumbnail((max_size, max_size), Image.LANCZOS)
#     buf = io.BytesIO()
#     img.convert("RGB").save(buf, format=fmt, quality=quality, optimize=True)
#     return base64.b64encode(buf.getvalue()).decode()


# def is_context_error(exc: Exception) -> bool:
#     return isinstance(exc, BadRequestError) and "maximum context length" in str(exc)


# def set_optimize_arg(retry_state: RetryCallState):
#     if is_context_error(retry_state.outcome.exception()):
#         retry_state.kwargs["optimize"] = True
#         logger.info(
#             "Detected context-length error → switching to optimized image on retry"
#         )


# @retry(
#     retry=retry_if_exception_type((RateLimitError, APIError, BadRequestError)),
#     wait=wait_exponential(multiplier=1, min=1, max=30),
#     stop=stop_after_attempt(3),
#     before_sleep=before_sleep_log(logger, logging.INFO),
#     after=set_optimize_arg,
#     reraise=True,
# )
# def _call_with_retry(path: str, optimize: bool = False):
#     if optimize:
#         logger.info("Using optimized image for this attempt")
#         img_data = optimized_img_to_data_url(path)
#     else:
#         logger.info("Using original image for this attempt")
#         img_data = optimized_img_to_data_url(path, max_size=1600, quality=95)
#     return client.beta.chat.completions.parse(
#         model="qwen/qwen2.5-vl-72b-instruct:free",
#         messages=[
#             {"role": "system", "content": SYSTEM_PROMPT},
#             {
#                 "role": "user",
#                 "content": [
#                     {"type": "text", "text": USER_PROMPT},
#                     {
#                         "type": "image_url",
#                         "image_url": {"url": f"data:image/jpeg;base64,{img_data}"},
#                     },
#                 ],
#             },
#         ],
#         response_format=MovieMetadata,
#     )


# def extract_ticket(path: str):
#     try:
#         resp = _call_with_retry(path, optimize=False)
#         return resp.choices[0].message.parsed
#     except BadRequestError as e:
#         raise RuntimeError("Still context-limited after optimization") from e
#     except ValidationError as e:
#         raise RuntimeError(f"Schema validation failed: {e}") from e
