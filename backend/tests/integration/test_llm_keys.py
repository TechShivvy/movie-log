"""routers/public_profile.py's llm-keys endpoints — encrypted storage,
masking, live-validate-before-store, storage preference, and the
Iteration 15 account-deletion cascade. Store/list/delete operations
below need a real key to validate against (check_api_key makes a free
metadata call, no tokens spent) — marked @pytest.mark.llm and using the
personal test keys, per tests/README.md; never the backend's own paid
OPENROUTER_API_KEY.
"""

import pytest
from conftest import personal_test_key, real_ticket_image_bytes


@pytest.mark.asyncio
async def test_storing_an_obviously_garbage_key_422s_without_storing(client, make_user):
    _, token = await make_user()
    headers = {'Authorization': f'Bearer {token}'}
    response = await client.put(
        '/api/v1/public/me/llm-keys/openai', headers=headers, json={'api_key': 'totally-fake-garbage-key'},
    )
    assert response.status_code == 422
    assert response.json()['code'] == 'INVALID_API_KEY'

    listed = await client.get('/api/v1/public/me/llm-keys', headers=headers)
    assert listed.json() == []


@pytest.mark.asyncio
async def test_unknown_provider_path_segment_404s(client, make_user):
    _, token = await make_user()
    response = await client.put(
        '/api/v1/public/me/llm-keys/anthropic', headers={'Authorization': f'Bearer {token}'},
        json={'api_key': 'x'},
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_deleting_a_key_that_was_never_stored_404s(client, make_user):
    _, token = await make_user()
    response = await client.delete(
        '/api/v1/public/me/llm-keys/gemini', headers={'Authorization': f'Bearer {token}'},
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_storage_preference_defaults_false_and_round_trips(client, make_user):
    _, token = await make_user()
    headers = {'Authorization': f'Bearer {token}'}
    settings_row = await client.patch(
        '/api/v1/public/me/username', headers=headers, json={'username': f'llmkeytest{token[-8:].lower()}'},
    )
    assert settings_row.json().get('llm_keys_storage_opt_in') is False  # default, before ever touching it

    updated = await client.patch(
        '/api/v1/public/me/llm-key-storage-preference', headers=headers, json={'store_on_server': True},
    )
    assert updated.status_code == 200
    assert updated.json()['llm_keys_storage_opt_in'] is True

    bad = await client.patch(
        '/api/v1/public/me/llm-key-storage-preference', headers=headers, json={'store_on_server': 'not a bool'},
    )
    assert bad.status_code == 422


@pytest.mark.llm
@pytest.mark.asyncio
async def test_opting_out_of_server_storage_deletes_already_stored_keys(client, make_user):
    """An explicit "stop storing this" has to mean the already-stored copy
    goes too, not just that future storage stops — otherwise a user who
    opts out is left with a stale key sitting in the DB, contradicting
    what they just asked for."""

    key = personal_test_key('GEMINI_API_KEY_1')
    if not key:
        pytest.skip('GEMINI_API_KEY_1 not configured in backend/.env')

    _, token = await make_user()
    headers = {'Authorization': f'Bearer {token}'}
    stored = await client.put('/api/v1/public/me/llm-keys/gemini', headers=headers, json={'api_key': key})
    assert stored.status_code == 200

    opt_out = await client.patch(
        '/api/v1/public/me/llm-key-storage-preference', headers=headers, json={'store_on_server': False},
    )
    assert opt_out.status_code == 200
    assert opt_out.json()['llm_keys_storage_opt_in'] is False

    listed = await client.get('/api/v1/public/me/llm-keys', headers=headers)
    assert listed.json() == []  # the stored gemini key is actually gone, not just the flag flipped


@pytest.mark.llm
@pytest.mark.asyncio
async def test_store_list_delete_a_real_key_masked_throughout(client, make_user):
    key = personal_test_key('GEMINI_API_KEY_1')
    if not key:
        pytest.skip('GEMINI_API_KEY_1 not configured in backend/.env')

    _, token = await make_user()
    headers = {'Authorization': f'Bearer {token}'}

    stored = await client.put('/api/v1/public/me/llm-keys/gemini', headers=headers, json={'api_key': key})
    assert stored.status_code == 200
    assert stored.json()['key_prefix'] == key[:8]
    assert 'encrypted_key' not in stored.json()
    assert stored.json()['key_prefix'] != key  # never the real value

    listed = await client.get('/api/v1/public/me/llm-keys', headers=headers)
    assert listed.status_code == 200
    assert [k['provider'] for k in listed.json()] == ['gemini']

    deleted = await client.delete('/api/v1/public/me/llm-keys/gemini', headers=headers)
    assert deleted.status_code == 204
    listed_after = await client.get('/api/v1/public/me/llm-keys', headers=headers)
    assert listed_after.json() == []


@pytest.mark.llm
@pytest.mark.asyncio
async def test_stored_key_is_genuinely_usable_for_a_real_extraction(client, make_user):
    """The actual point of storing a key at all: a genuinely fresh
    extract call with NO header key must succeed using the stored,
    decrypted key — the full seamless multi-surface path from
    Iteration 13."""

    key = personal_test_key('GEMINI_API_KEY_1')
    if not key:
        pytest.skip('GEMINI_API_KEY_1 not configured in backend/.env')

    _, token = await make_user()
    headers = {'Authorization': f'Bearer {token}'}
    stored = await client.put('/api/v1/public/me/llm-keys/gemini', headers=headers, json={'api_key': key})
    assert stored.status_code == 200

    extract = await client.post(
        '/api/v1/movie-metadata/extract', headers=headers,
        files={'ticket_image': ('ticket-1.png', real_ticket_image_bytes(), 'image/png')},
        data={'provider': 'gemini', 'model': 'gemini-flash-latest'},
    )
    assert extract.status_code == 200
    assert extract.json()['used_provider'] == 'gemini'


@pytest.mark.llm
@pytest.mark.asyncio
async def test_account_deletion_cascades_to_stored_llm_keys(client, make_user):
    """The Iteration 15 cascade check, verified directly against
    user_llm_keys (which has zero PostgREST grants at all — the only way
    to read it is the service-role key, same as the app's own
    llm_keys.py service module uses), not just inferred from the
    deletion call succeeding."""

    key = personal_test_key('GEMINI_API_KEY_1')
    if not key:
        pytest.skip('GEMINI_API_KEY_1 not configured in backend/.env')

    import httpx
    from config import settings

    admin_key = (
        settings.supabase_secret_key.get_secret_value() if settings.supabase_secret_key
        else settings.supabase_service_role_key.get_secret_value()
    )

    user_id, token = await make_user()
    headers = {'Authorization': f'Bearer {token}'}
    stored = await client.put('/api/v1/public/me/llm-keys/gemini', headers=headers, json={'api_key': key})
    assert stored.status_code == 200

    # A *plain* httpx client, deliberately not the ASGI-transport-bound
    # `client` fixture — that one routes every request through the local
    # app regardless of the URL given, so it can't reach the real
    # Supabase REST API this check needs.
    async with httpx.AsyncClient(timeout=15.0) as admin_http:
        async def _row_count() -> int:
            resp = await admin_http.get(
                f"{settings.supabase_url.rstrip('/')}/rest/v1/user_llm_keys",
                headers={'apikey': admin_key, 'Authorization': f'Bearer {admin_key}'},
                params={'user_id': f'eq.{user_id}', 'select': 'provider'},
            )
            assert resp.status_code == 200
            return len(resp.json())

        assert await _row_count() == 1

        deletion = await client.request('DELETE', '/api/v1/auth/me', headers=headers, json={'confirm': True})
        assert deletion.status_code == 204

        assert await _row_count() == 0
