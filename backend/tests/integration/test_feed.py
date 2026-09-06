"""GET /public/feed — visibility (only public logs, only from accepted-
follow accounts the caller can actually view), self-exclusion, and the
"the view must repeat its own RLS filter" gotcha from Iteration 2 (a
followed account's private/followers_only-without-access logs must never
leak through, even though feed_entries runs under the view owner's
rights on the underlying movie_logs table).
"""

import uuid

import pytest
from conftest import THEATRE_TEST_TAG, theatre_place_payload


async def _set_username_and_privacy(client, headers, visibility='public'):
    username = f'feed{uuid.uuid4().hex[:12]}'
    await client.patch('/api/v1/public/me/username', headers=headers, json={'username': username})
    await client.patch('/api/v1/public/me/privacy', headers=headers, json={'account_visibility': visibility})
    return username


@pytest.mark.asyncio
async def test_feed_requires_sign_in(client):
    response = await client.get('/api/v1/public/feed')
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_feed_shows_only_public_logs_from_followed_accounts(client, make_user):
    _, viewer_token = await make_user()
    _, followed_token = await make_user()
    viewer_headers = {'Authorization': f'Bearer {viewer_token}'}
    followed_headers = {'Authorization': f'Bearer {followed_token}'}

    followed_username = await _set_username_and_privacy(client, followed_headers, 'public')
    follow = await client.post(f'/api/v1/public/follows/{followed_username}', headers=viewer_headers)
    assert follow.json()['status'] == 'accepted'

    public_log = await client.post(
        '/api/v1/movie-logs', headers=followed_headers,
        json={'movie': 'Feed Public', 'visibility': 'public', 'theatre_place': theatre_place_payload()},
    )
    private_log = await client.post(
        '/api/v1/movie-logs', headers=followed_headers,
        json={'movie': 'Feed Private', 'visibility': 'private', 'theatre_place': theatre_place_payload()},
    )
    anon_log = await client.post(
        '/api/v1/movie-logs', headers=followed_headers,
        json={'movie': 'Feed Anon', 'visibility': 'anonymous', 'theatre_place': theatre_place_payload()},
    )

    feed = await client.get('/api/v1/public/feed', headers=viewer_headers)
    assert feed.status_code == 200
    feed_ids = {entry['id'] for entry in feed.json()}
    assert public_log.json()['id'] in feed_ids
    assert private_log.json()['id'] not in feed_ids
    assert anon_log.json()['id'] not in feed_ids


@pytest.mark.asyncio
async def test_feed_never_includes_the_callers_own_logs(client, make_user):
    _, token = await make_user()
    headers = {'Authorization': f'Bearer {token}'}
    await _set_username_and_privacy(client, headers, 'public')
    own_log = await client.post(
        '/api/v1/movie-logs', headers=headers,
        json={'movie': 'My Own Public Log', 'visibility': 'public', 'theatre_place': theatre_place_payload()},
    )
    feed = await client.get('/api/v1/public/feed', headers=headers)
    assert own_log.json()['id'] not in [entry['id'] for entry in feed.json()]


@pytest.mark.asyncio
async def test_feed_excludes_a_followed_but_not_accessible_account(client, make_user):
    """A pending (not yet accepted) follow shouldn't surface anything —
    can_view_user_content gates the feed on top of the follow itself."""

    _, viewer_token = await make_user()
    _, target_token = await make_user()
    viewer_headers = {'Authorization': f'Bearer {viewer_token}'}
    target_headers = {'Authorization': f'Bearer {target_token}'}

    target_username = await _set_username_and_privacy(client, target_headers, 'private')
    await client.post(
        '/api/v1/movie-logs', headers=target_headers,
        json={'movie': 'Pending Follow Log', 'visibility': 'public', 'theatre_place': theatre_place_payload()},
    )
    follow = await client.post(f'/api/v1/public/follows/{target_username}', headers=viewer_headers)
    assert follow.json()['status'] == 'pending'  # never accepted

    feed = await client.get('/api/v1/public/feed', headers=viewer_headers)
    assert 'Pending Follow Log' not in [e['movie'] for e in feed.json()]


@pytest.mark.asyncio
async def test_feed_movie_id_theatre_id_screen_id_filters(client, make_user):
    """Filter-only narrowing on top of the existing feed gating — the
    feed_entries view already carries movie_id/theatre_id/screen_id, no
    schema change needed."""

    _, viewer_token = await make_user()
    _, followed_token = await make_user()
    viewer_headers = {'Authorization': f'Bearer {viewer_token}'}
    followed_headers = {'Authorization': f'Bearer {followed_token}'}

    followed_username = await _set_username_and_privacy(client, followed_headers, 'public')
    follow = await client.post(f'/api/v1/public/follows/{followed_username}', headers=viewer_headers)
    assert follow.json()['status'] == 'accepted'

    theatre = await client.post(
        '/api/v1/venues/theatres', headers=followed_headers,
        json={'name': f'Feed Filter Theatre{THEATRE_TEST_TAG}', 'place_id': f'feedfilter-{uuid.uuid4().hex[:8]}', 'city': 'X', 'country': 'US'},
    )
    theatre_id = theatre.json()['id']

    at_theatre = await client.post(
        '/api/v1/movie-logs', headers=followed_headers,
        json={'movie': 'Feed Filter At Theatre', 'visibility': 'public', 'theatre_id': theatre_id},
    )
    elsewhere = await client.post(
        '/api/v1/movie-logs', headers=followed_headers,
        json={
            'movie': 'Feed Filter Elsewhere', 'visibility': 'public',
            'theatre_place': theatre_place_payload(),
        },
    )

    filtered = await client.get(
        '/api/v1/public/feed', headers=viewer_headers, params={'theatre_id': theatre_id},
    )
    assert filtered.status_code == 200
    filtered_ids = {e['id'] for e in filtered.json()}
    assert at_theatre.json()['id'] in filtered_ids
    assert elsewhere.json()['id'] not in filtered_ids
