from openai import OpenAI
from pydantic import ValidationError


def extract_movie_metadata_from_image(
    image_data_uri: str,
    api_key: str,
    system_prompt: str,
    user_prompt: str,
    response_model,
    model_name: str = 'qwen/qwen2.5-vl-72b-instruct:free',
):
    client = OpenAI(base_url='https://openrouter.ai/api/v1', api_key=api_key)
    try:
        response = client.beta.chat.completions.parse(
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
    except ValidationError:
        raise
    except Exception:
        raise
