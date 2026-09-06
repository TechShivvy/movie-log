"""routers/venues.py — theatres/screens create + dedupe fallback, per-
venue notes, lifecycle status (admin-only), and venue notes being
independent of any specific log.
"""

import uuid

import pytest
from conftest import THEATRE_TEST_TAG, delete_theatre_by_id


@pytest.mark.asyncio
async def test_search_places_500s_config_error_when_places_key_unset(client, make_user, patch_settings):
    patch_settings(google_places_api_key=None)
    _, token = await make_user()
    response = await client.post(
        '/api/v1/venues/theatres/search-places', headers={'Authorization': f'Bearer {token}'},
        json={'query': 'PVR Cinemas'},
    )
    assert response.status_code == 500
    assert response.json()['code'] == 'CONFIG_ERROR'


@pytest.mark.external
@pytest.mark.asyncio
async def test_create_theatre_falls_back_to_submitted_data_on_places_failure(client, make_user):
    """Google Places lookup failing (a fake place_id) must never block
    theatre creation — falls back to source='user_submitted'. Marked
    external: routers/venues.py only calls Places at all when
    GOOGLE_PLACES_API_KEY is configured (see google_places.is_configured()),
    so whenever it is, this makes a real (billed) lookup against a
    guaranteed-not-found id — opt-in for the same reason test_llm_keys.py's
    real-provider tests are."""

    _, token = await make_user()
    response = await client.post(
        '/api/v1/venues/theatres', headers={'Authorization': f'Bearer {token}'},
        json={'name': f'Fallback Test Theatre{THEATRE_TEST_TAG}', 'place_id': f'fake-{uuid.uuid4().hex[:8]}', 'city': 'X', 'country': 'US'},
    )
    assert response.status_code == 201
    assert response.json()['name'] == f'Fallback Test Theatre{THEATRE_TEST_TAG}'
    assert response.json()['source'] == 'user_submitted'


@pytest.mark.external
@pytest.mark.asyncio
async def test_create_theatre_with_a_real_place_id_populates_authoritative_fields(client, make_user):
    """The success path the fallback test above doesn't cover: a real
    place_id must make name/address/lat-lng/city/country come back
    server-authoritative (source='google_places'), overriding whatever
    was submitted — the actual point of the Places integration. Chains a
    real autocomplete() search into place_details() the same way a real
    client would (POST /theatres/search-places -> pick a result -> POST
    /theatres), rather than hardcoding a place_id that could go stale."""

    from services import google_places
    if not google_places.is_configured():
        pytest.skip('GOOGLE_PLACES_API_KEY not configured in backend/.env')

    _, token = await make_user()
    headers = {'Authorization': f'Bearer {token}'}
    suggestions = await client.post(
        '/api/v1/venues/theatres/search-places', headers=headers, json={'query': 'PVR Cinemas'},
    )
    assert suggestions.status_code == 200
    candidates = suggestions.json()
    if not candidates:
        pytest.skip('Google Places returned no real suggestions for the test query')
    place_id = candidates[0]['place_id']

    response = await client.post(
        '/api/v1/venues/theatres', headers=headers,
        json={'name': 'Should Be Overridden', 'place_id': place_id, 'city': 'Should Be Overridden', 'country': 'ZZ'},
    )
    assert response.status_code == 201
    body = response.json()
    try:
        assert body['source'] == 'google_places'
        assert body['name'] != 'Should Be Overridden'  # server-authoritative, client value discarded
        assert body['place_id'] == place_id
        assert body['lat'] is not None and body['lng'] is not None
    finally:
        # The name is real (server-authoritative from Places), not
        # THEATRE_TEST_TAG-able — clean this one up directly by id
        # instead of relying on the name-based sweep in conftest.py.
        await delete_theatre_by_id(body['id'])


@pytest.mark.asyncio
async def test_venue_note_independent_of_any_log(client, make_user):
    _, token = await make_user()
    headers = {'Authorization': f'Bearer {token}'}
    theatre = await client.post(
        '/api/v1/venues/theatres', headers=headers,
        json={'name': f'Note Test Theatre{THEATRE_TEST_TAG}', 'place_id': f'note-{uuid.uuid4().hex[:8]}', 'city': 'X', 'country': 'US'},
    )
    theatre_id = theatre.json()['id']

    note = await client.put(
        f'/api/v1/venues/theatres/{theatre_id}/note', headers=headers, json={'note': 'Always ask for row H'},
    )
    assert note.status_code == 200
    assert note.json()['note'] == 'Always ask for row H'

    fetched = await client.get(f'/api/v1/venues/theatres/{theatre_id}/note', headers=headers)
    assert fetched.json()['note'] == 'Always ask for row H'

    deleted = await client.delete(f'/api/v1/venues/theatres/{theatre_id}/note', headers=headers)
    assert deleted.status_code == 204


@pytest.mark.asyncio
async def test_theatre_with_no_data_at_all_404s_stats(client, make_user):
    _, token = await make_user()
    theatre = await client.post(
        '/api/v1/venues/theatres', headers={'Authorization': f'Bearer {token}'},
        json={'name': f'Empty Stats Theatre{THEATRE_TEST_TAG}', 'place_id': f'empty-{uuid.uuid4().hex[:8]}', 'city': 'X', 'country': 'US'},
    )
    theatre_id = theatre.json()['id']
    stats = await client.get(f'/api/v1/venues/theatres/{theatre_id}/stats')
    assert stats.status_code == 404


@pytest.mark.asyncio
async def test_get_theatre_by_id(client, make_user):
    _, token = await make_user()
    headers = {'Authorization': f'Bearer {token}'}
    theatre = await client.post(
        '/api/v1/venues/theatres', headers=headers,
        json={'name': f'Get By Id Theatre{THEATRE_TEST_TAG}', 'place_id': f'getid-{uuid.uuid4().hex[:8]}', 'city': 'X', 'country': 'US'},
    )
    theatre_id = theatre.json()['id']

    fetched = await client.get(f'/api/v1/venues/theatres/{theatre_id}')  # no auth
    assert fetched.status_code == 200
    assert fetched.json()['id'] == theatre_id
    assert fetched.json()['name'] == f'Get By Id Theatre{THEATRE_TEST_TAG}'
    assert fetched.json()['nickname'] is None

    missing = await client.get('/api/v1/venues/theatres/00000000-0000-0000-0000-000000000000')
    assert missing.status_code == 404


@pytest.mark.asyncio
async def test_theatre_nickname_admin_only_independent_fields_and_match_ranking(
    client, make_user, admin_user,
):
    _, non_admin_token = await make_user()
    admin_id, admin_token = admin_user
    theatre = await client.post(
        '/api/v1/venues/theatres', headers={'Authorization': f'Bearer {admin_token}'},
        json={'name': f'Nickname Test Theatre{THEATRE_TEST_TAG}', 'place_id': f'nick-{uuid.uuid4().hex[:8]}', 'city': 'X', 'country': 'US'},
    )
    theatre_id = theatre.json()['id']
    assert theatre.json()['nickname'] is None
    assert theatre.json()['nickname_address'] is None

    non_admin_attempt = await client.patch(
        f'/api/v1/venues/theatres/{theatre_id}/nickname', headers={'Authorization': f'Bearer {non_admin_token}'},
        json={'nickname': 'Should Fail'},
    )
    assert non_admin_attempt.status_code == 403

    empty_patch = await client.patch(
        f'/api/v1/venues/theatres/{theatre_id}/nickname', headers={'Authorization': f'Bearer {admin_token}'},
        json={},
    )
    assert empty_patch.status_code == 400

    # Set nickname only — nickname_address untouched (stays null).
    set_nickname = await client.patch(
        f'/api/v1/venues/theatres/{theatre_id}/nickname', headers={'Authorization': f'Bearer {admin_token}'},
        json={'nickname': 'The Nickname'},
    )
    assert set_nickname.status_code == 200
    assert set_nickname.json()['nickname'] == 'The Nickname'
    assert set_nickname.json()['nickname_address'] is None
    # The Google-sourced name is untouched by setting a nickname.
    assert set_nickname.json()['name'] == f'Nickname Test Theatre{THEATRE_TEST_TAG}'

    # A search against the nickname alone (not the real name) surfaces it.
    match = await client.post(
        '/api/v1/venues/theatres/match', headers={'Authorization': f'Bearer {non_admin_token}'},
        json={'query': 'The Nickname'},
    )
    assert theatre_id in [m['id'] for m in match.json()]
    matched = next(m for m in match.json() if m['id'] == theatre_id)
    assert matched['nickname'] == 'The Nickname'

    # Independently set nickname_address, leaving nickname as-is.
    set_address = await client.patch(
        f'/api/v1/venues/theatres/{theatre_id}/nickname', headers={'Authorization': f'Bearer {admin_token}'},
        json={'nickname_address': '123 Old St'},
    )
    assert set_address.status_code == 200
    assert set_address.json()['nickname'] == 'The Nickname'
    assert set_address.json()['nickname_address'] == '123 Old St'

    # Empty string clears just the field sent.
    clear_nickname = await client.patch(
        f'/api/v1/venues/theatres/{theatre_id}/nickname', headers={'Authorization': f'Bearer {admin_token}'},
        json={'nickname': ''},
    )
    assert clear_nickname.status_code == 200
    assert clear_nickname.json()['nickname'] is None
    assert clear_nickname.json()['nickname_address'] == '123 Old St'  # untouched


@pytest.mark.asyncio
async def test_match_theatres_short_chain_prefix_finds_a_long_name(client, make_user, admin_user):
    """Regression for a live-verified bug: plain similarity() compares the
    whole query against the whole target, so a short chain-name prefix
    ('PVR') against a real long theatre name ('PVR VR Chennai Anna Nagar')
    used to come back empty even though the full name matched with
    similarity 1. match_theatres now also ranks/filters on word_similarity,
    which finds the best-matching word-boundary substring instead of
    comparing the two strings as wholes."""

    admin_id, admin_token = admin_user
    chain = f'Zq{uuid.uuid4().hex[:4]}'.upper()  # a short, unique "chain name" prefix
    name = f'{chain} Multiplex Grand City Mall Downtown Cinema{THEATRE_TEST_TAG}'
    theatre = await client.post(
        '/api/v1/venues/theatres', headers={'Authorization': f'Bearer {admin_token}'},
        json={'name': name, 'place_id': f'wordsim-{uuid.uuid4().hex[:8]}', 'city': 'X', 'country': 'US'},
    )
    theatre_id = theatre.json()['id']

    short_match = await client.post(
        '/api/v1/venues/theatres/match', headers={'Authorization': f'Bearer {admin_token}'},
        json={'query': chain},
    )
    assert short_match.status_code == 200
    assert theatre_id in [m['id'] for m in short_match.json()]

    # Full-name matching (the pre-existing similarity() path) still works —
    # this fix is additive, not a replacement.
    full_match = await client.post(
        '/api/v1/venues/theatres/match', headers={'Authorization': f'Bearer {admin_token}'},
        json={'query': name},
    )
    assert theatre_id in [m['id'] for m in full_match.json()]

    # An unrelated short query must not match — the added word_similarity
    # condition shouldn't turn this into a "3 random letters matches
    # everything" search.
    unrelated_match = await client.post(
        '/api/v1/venues/theatres/match', headers={'Authorization': f'Bearer {admin_token}'},
        json={'query': 'Xyz'},
    )
    assert theatre_id not in [m['id'] for m in unrelated_match.json()]


@pytest.mark.asyncio
async def test_venue_status_admin_only_and_never_hides_from_search(client, make_user, admin_user):
    _, non_admin_token = await make_user()
    admin_id, admin_token = admin_user
    theatre = await client.post(
        '/api/v1/venues/theatres', headers={'Authorization': f'Bearer {admin_token}'},
        json={'name': f'Status Test Theatre{THEATRE_TEST_TAG}', 'place_id': f'status-{uuid.uuid4().hex[:8]}', 'city': 'X', 'country': 'US'},
    )
    theatre_id = theatre.json()['id']

    non_admin_attempt = await client.patch(
        f'/api/v1/venues/theatres/{theatre_id}/status', headers={'Authorization': f'Bearer {non_admin_token}'},
        json={'status': 'closed'},
    )
    assert non_admin_attempt.status_code == 403

    admin_update = await client.patch(
        f'/api/v1/venues/theatres/{theatre_id}/status', headers={'Authorization': f'Bearer {admin_token}'},
        json={'status': 'closed'},
    )
    assert admin_update.status_code == 200
    assert admin_update.json()['status'] == 'closed'

    # Still fully matchable/searchable — status never hides a venue.
    match = await client.post(
        '/api/v1/venues/theatres/match', headers={'Authorization': f'Bearer {non_admin_token}'},
        json={'query': f'Status Test Theatre{THEATRE_TEST_TAG}'},
    )
    assert theatre_id in [m['id'] for m in match.json()]
