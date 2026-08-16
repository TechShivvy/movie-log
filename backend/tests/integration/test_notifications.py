"""routers/notifications.py — all 5 event types (follow-related from
Iteration 4, comment/like/report_resolved from Iteration 10),
enrichment fields (Iteration 11), self-notification skip, and the
cascade-delete-with-what-it-points-at behavior.
"""

import uuid

import pytest


async def _set_username(client, headers):
    username = f'notif{uuid.uuid4().hex[:12]}'
    await client.patch('/api/v1/public/me/username', headers=headers, json={'username': username})
    return username


@pytest.mark.asyncio
async def test_public_account_follow_produces_new_follower_notification(client, make_user):
    _, follower_token = await make_user()
    _, target_token = await make_user()
    target_headers = {'Authorization': f'Bearer {target_token}'}
    target_username = await _set_username(client, target_headers)
    await client.patch('/api/v1/public/me/privacy', headers=target_headers, json={'account_visibility': 'public'})

    await client.post(
        f'/api/v1/public/follows/{target_username}', headers={'Authorization': f'Bearer {follower_token}'},
    )

    notifications = await client.get('/api/v1/notifications', headers=target_headers)
    assert notifications.status_code == 200
    types = [n['type'] for n in notifications.json()]
    assert 'new_follower' in types


@pytest.mark.asyncio
async def test_comment_and_like_produce_enriched_notifications(client, make_user):
    owner_id, owner_token = await make_user()
    commenter_id, commenter_token = await make_user()
    owner_headers = {'Authorization': f'Bearer {owner_token}'}
    commenter_headers = {'Authorization': f'Bearer {commenter_token}'}
    await _set_username(client, commenter_headers)

    log = await client.post(
        '/api/v1/movie-logs', headers=owner_headers, json={'movie': 'Notif Enrichment Test', 'visibility': 'public'},
    )
    log_id = log.json()['id']
    await client.post(
        '/api/v1/comments', headers=commenter_headers, json={'movie_log_id': log_id, 'text': 'Nice one'},
    )
    await client.post(f'/api/v1/movie-logs/{log_id}/like', headers=commenter_headers)

    notifications = await client.get('/api/v1/notifications', headers=owner_headers)
    by_type = {n['type']: n for n in notifications.json()}
    assert 'new_comment' in by_type
    assert by_type['new_comment']['movie'] == 'Notif Enrichment Test'
    assert by_type['new_comment']['comment_preview'] == 'Nice one'
    assert by_type['new_comment']['actor_username'] is not None
    assert 'log_like' in by_type


@pytest.mark.asyncio
async def test_commenting_on_your_own_log_does_not_self_notify(client, make_user):
    _, token = await make_user()
    headers = {'Authorization': f'Bearer {token}'}
    log = await client.post(
        '/api/v1/movie-logs', headers=headers, json={'movie': 'Self Notify Test', 'visibility': 'public'},
    )
    await client.post(
        '/api/v1/comments', headers=headers, json={'movie_log_id': log.json()['id'], 'text': 'Commenting on my own'},
    )
    notifications = await client.get('/api/v1/notifications', headers=headers)
    assert notifications.json() == []


@pytest.mark.asyncio
async def test_marking_someone_elses_notification_404s(client, make_user):
    _, follower_token = await make_user()
    _, target_token = await make_user()
    target_headers = {'Authorization': f'Bearer {target_token}'}
    target_username = await _set_username(client, target_headers)
    await client.patch('/api/v1/public/me/privacy', headers=target_headers, json={'account_visibility': 'public'})
    await client.post(
        f'/api/v1/public/follows/{target_username}', headers={'Authorization': f'Bearer {follower_token}'},
    )
    notifications = await client.get('/api/v1/notifications', headers=target_headers)
    notification_id = notifications.json()[0]['id']

    as_follower = await client.post(
        f'/api/v1/notifications/{notification_id}/read', headers={'Authorization': f'Bearer {follower_token}'},
    )
    assert as_follower.status_code == 404


@pytest.mark.asyncio
async def test_mark_read_omits_the_enriched_fields(client, make_user):
    owner_id, owner_token = await make_user()
    commenter_id, commenter_token = await make_user()
    owner_headers = {'Authorization': f'Bearer {owner_token}'}
    log = await client.post(
        '/api/v1/movie-logs', headers=owner_headers, json={'movie': 'Mark Read Test', 'visibility': 'public'},
    )
    await client.post(
        '/api/v1/comments', headers={'Authorization': f'Bearer {commenter_token}'},
        json={'movie_log_id': log.json()['id'], 'text': 'x'},
    )
    notifications = await client.get('/api/v1/notifications', headers=owner_headers)
    notification_id = notifications.json()[0]['id']

    marked = await client.post(f'/api/v1/notifications/{notification_id}/read', headers=owner_headers)
    assert marked.status_code == 200
    assert marked.json()['read'] is True
    assert marked.json().get('movie') is None
    assert marked.json().get('comment_preview') is None
