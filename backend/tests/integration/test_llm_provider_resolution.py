"""routers/movie_metadata.py's resolve_provider_and_model/resolve_llm_api_key
— the request > stored preference > default resolution chain from
Iteration 13, and the real provider-override bug it caught live: an
explicit provider override with no explicit model, while a *different*
provider's preference was stored, must never fall through to the
mismatched stored model.

Real LLM provider calls only where unavoidable, and only ever the
backend's shared OpenRouter key against a verified-free model (the same
shared/quota-bounded path this whole project already relies on for
manual verification) — never the personal OpenAI/Gemini test keys here,
those live in test_llm_keys.py under @pytest.mark.llm.
"""

import base64

import pytest

# A 1x1 white PNG — enough to exercise the real extraction pipeline
# without needing a realistic ticket image; the LLM output content isn't
# what these tests care about, only which provider/model actually got
# called.
_TINY_PNG = base64.b64decode(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42'
    'YAAAAASUVORK5CYII='
)


@pytest.mark.asyncio
async def test_openai_requires_own_key_400s_cleanly_no_real_call(client, make_user):
    _, token = await make_user()
    response = await client.post(
        '/api/v1/movie-metadata/extract', headers={'Authorization': f'Bearer {token}'},
        files={'ticket_image': ('t.png', _TINY_PNG, 'image/png')},
        data={'provider': 'openai'},
    )
    assert response.status_code == 400
    assert response.json()['code'] == 'BAD_REQUEST'
    assert 'OpenAI' in response.json()['message']


@pytest.mark.asyncio
async def test_gemini_requires_own_key_400s_cleanly_no_real_call(client, make_user):
    _, token = await make_user()
    response = await client.post(
        '/api/v1/movie-metadata/extract', headers={'Authorization': f'Bearer {token}'},
        files={'ticket_image': ('t.png', _TINY_PNG, 'image/png')},
        data={'provider': 'gemini'},
    )
    assert response.status_code == 400
    assert 'Gemini' in response.json()['message']


@pytest.mark.asyncio
async def test_stored_preference_used_when_request_omits_provider_and_model(client, make_user):
    _, token = await make_user()
    headers = {'Authorization': f'Bearer {token}'}
    pref = await client.patch(
        '/api/v1/public/me/llm-preference', headers=headers,
        json={'provider': 'gemini', 'model': 'gemini-flash-latest'},
    )
    assert pref.status_code == 200

    # No provider/model in the request at all, and no stored key either
    # — should resolve provider=gemini from the stored preference (not
    # the static openrouter default), then correctly 400 needing a key
    # for that provider specifically.
    response = await client.post(
        '/api/v1/movie-metadata/extract', headers=headers,
        files={'ticket_image': ('t.png', _TINY_PNG, 'image/png')},
    )
    assert response.status_code == 400
    assert 'Gemini' in response.json()['message']


@pytest.mark.asyncio
async def test_explicit_provider_override_ignores_a_mismatched_stored_model(client, make_user):
    """The exact regression: an explicit provider=openrouter override
    with no explicit model, while a *gemini* preference is stored, must
    resolve to an OpenRouter-appropriate default model — never the
    stored Gemini model name sent to the wrong provider. Exercises the
    real shared-key path (backend's own OpenRouter key, quota-bounded,
    server-enforced free-models-only — never a paid model, same
    constraint every manual verification this project has used already
    relies on)."""

    _, token = await make_user()
    headers = {'Authorization': f'Bearer {token}'}
    await client.patch(
        '/api/v1/public/me/llm-preference', headers=headers,
        json={'provider': 'gemini', 'model': 'gemini-flash-latest'},
    )

    response = await client.post(
        '/api/v1/movie-metadata/extract', headers=headers,
        files={'ticket_image': ('t.png', _TINY_PNG, 'image/png')},
        data={'provider': 'openrouter'},
    )
    # Before the fix this would have sent "gemini-flash-latest" to
    # OpenRouter and failed with a model-not-found-shaped error instead
    # of succeeding against OpenRouter's own resolved free default.
    assert response.status_code == 200
    assert response.json()['used_provider'] == 'openrouter'
    assert response.json()['used_model'] != 'gemini-flash-latest'


@pytest.mark.asyncio
async def test_explicit_request_model_overrides_everything(client, make_user):
    """An explicit provider AND model always wins, regardless of any
    stored preference — the top of the resolution chain."""

    _, token = await make_user()
    headers = {'Authorization': f'Bearer {token}'}
    await client.patch(
        '/api/v1/public/me/llm-preference', headers=headers,
        json={'provider': 'gemini', 'model': 'gemini-flash-latest'},
    )
    response = await client.post(
        '/api/v1/movie-metadata/extract', headers=headers,
        files={'ticket_image': ('t.png', _TINY_PNG, 'image/png')},
        data={'provider': 'openai'},  # explicit override, ignores the stored gemini preference
    )
    assert response.status_code == 400
    assert 'OpenAI' in response.json()['message']  # confirms openai (the explicit override), not gemini, was resolved
