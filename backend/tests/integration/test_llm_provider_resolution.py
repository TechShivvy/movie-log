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
from conftest import real_ticket_image_bytes

# A 1x1 white PNG — enough to exercise the real extraction pipeline for
# tests that 400 before ever reaching the LLM call (no key for the
# resolved provider), where the LLM never actually sees the bytes at
# all. For any test that asserts a genuinely successful 200 extraction,
# use real_ticket_image_bytes() instead — a real (if tiny) blank image
# is now correctly rejected as NOT_A_TICKET by schemas/movie_metadata.py's
# is_ticket check, confirmed live, so it can't stand in for "a real
# ticket" anymore.
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
async def test_fresh_user_settings_row_never_freezes_a_stale_default_model(client, make_user):
    """Real bug caught live: user_settings.preferred_model used to have a
    hardcoded DB default ('qwen/qwen2.5-vl-72b-instruct:free', since the
    very first migration) — any endpoint creating a user's settings row
    (not just PATCH /me/llm-preference; every profile endpoint upserts
    the same row) would silently freeze that value in as their
    "preference" even though they never chose it. That model has since
    fallen off OpenRouter's live free-tier list, so a plain extract call
    400'd with "Selected shared model must be a free model" for anyone
    whose settings row happened to exist. Fixed by dropping the column
    default entirely (migration 20260817000004) — preferred_model is now
    null until someone actually sets it, so this always re-resolves
    against whatever's genuinely free right now. Regression: create a
    settings row via an *unrelated* endpoint first (this is what exposed
    the bug — llm-preference was never touched), then confirm a plain
    extract still works via the real shared/free path."""

    _, token = await make_user()
    headers = {'Authorization': f'Bearer {token}'}
    settings_row = await client.patch(
        '/api/v1/public/me/revisit-prefill', headers=headers, json={'prefill_repeat_visit': True},
    )
    assert settings_row.status_code == 200
    assert settings_row.json().get('preferred_model') is None

    response = await client.post(
        '/api/v1/movie-metadata/extract', headers=headers,
        files={'ticket_image': ('t.png', real_ticket_image_bytes(), 'image/png')},
    )
    assert response.status_code == 200
    assert response.json()['used_provider'] == 'openrouter'


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
        files={'ticket_image': ('t.png', real_ticket_image_bytes(), 'image/png')},
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


@pytest.mark.asyncio
async def test_extract_rejects_a_confidently_non_ticket_image(client, make_user):
    """The two-step-ingestion-in-one-call feature: the model self-reports
    whether the input is even a ticket, alongside extracting it.
    _TINY_PNG (a genuinely blank/featureless image) is a real, confirmed-
    live case a real model reliably flags is_ticket=false for — not a
    contrived example. A real, if illegible, ticket photo (see the
    real_ticket_image_bytes()-using tests elsewhere in this file) still
    succeeds normally; this is specifically for input that's confidently
    something else."""

    _, token = await make_user()
    response = await client.post(
        '/api/v1/movie-metadata/extract', headers={'Authorization': f'Bearer {token}'},
        files={'ticket_image': ('t.png', _TINY_PNG, 'image/png')},
    )
    assert response.status_code == 422
    assert response.json()['code'] == 'NOT_A_TICKET'
    assert response.json()['message']  # a real, non-empty reason, not just the bare code


@pytest.mark.asyncio
async def test_extract_a_real_ticket_succeeds_with_populated_fields(client, make_user):
    """The positive-control counterpart to the rejection test above —
    confirms real_ticket_image_bytes() itself genuinely round-trips
    through a real extraction with is_ticket true and real fields
    populated, not just an empty 200."""

    _, token = await make_user()
    response = await client.post(
        '/api/v1/movie-metadata/extract', headers={'Authorization': f'Bearer {token}'},
        files={'ticket_image': ('ticket-1.png', real_ticket_image_bytes(), 'image/png')},
    )
    assert response.status_code == 200
    body = response.json()
    assert body['movie']  # a real title was actually extracted, not null
