"""routers/public_profile.py's own endpoints, tested directly — previously
only ever exercised incidentally as setup steps in other test files (e.g.
"set a username so search/follow tests have something to search for"),
never testing this router's own behaviors (conflict handling, profile
update round-trip) in their own right.
"""

import uuid

import pytest


@pytest.mark.asyncio
async def test_username_conflict_maps_to_409_not_a_raw_postgrest_400(client, make_user):
    """PostgREST surfaces the unique-index violation on user_settings.username
    as a generic 4xx — routers/public_profile.py:set_username re-raises it
    as a stable 409 USERNAME_TAKEN specifically, not left as whatever
    PostgREST's own error shape happened to be."""

    _, token_a = await make_user()
    _, token_b = await make_user()
    shared_name = f'conflicttest{uuid.uuid4().hex[:10]}'

    first = await client.patch(
        '/api/v1/public/me/username', headers={'Authorization': f'Bearer {token_a}'},
        json={'username': shared_name},
    )
    assert first.status_code == 200

    second = await client.patch(
        '/api/v1/public/me/username', headers={'Authorization': f'Bearer {token_b}'},
        json={'username': shared_name},
    )
    assert second.status_code == 409
    assert second.json()['code'] == 'USERNAME_TAKEN'


@pytest.mark.asyncio
async def test_setting_your_own_current_username_again_is_not_a_conflict(client, make_user):
    """Re-sending the same value you already own must not self-conflict —
    only a *different* user already holding it is a real conflict."""

    _, token = await make_user()
    name = f'sameuser{uuid.uuid4().hex[:10]}'
    first = await client.patch(
        '/api/v1/public/me/username', headers={'Authorization': f'Bearer {token}'}, json={'username': name},
    )
    assert first.status_code == 200

    again = await client.patch(
        '/api/v1/public/me/username', headers={'Authorization': f'Bearer {token}'}, json={'username': name},
    )
    assert again.status_code == 200


@pytest.mark.asyncio
async def test_profile_update_round_trips_display_name_bio_and_links(client, make_user):
    _, token = await make_user()
    headers = {'Authorization': f'Bearer {token}'}
    updated = await client.patch(
        '/api/v1/public/me/profile', headers=headers,
        json={
            'display_name': 'Test Display Name',
            'bio': 'A short bio.',
            'profile_links': [{'label': 'Letterboxd', 'url': 'https://letterboxd.com/testuser'}],
        },
    )
    assert updated.status_code == 200
    body = updated.json()
    assert body['display_name'] == 'Test Display Name'
    assert body['bio'] == 'A short bio.'
    assert body['profile_links'][0]['url'] == 'https://letterboxd.com/testuser'
