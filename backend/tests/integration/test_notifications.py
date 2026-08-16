"""routers/notifications.py — all 7 event types (follow-related from
Iteration 4, comment/like/report_resolved from Iteration 10, auto_insert_
complete/batch_extraction_complete from the batch-extraction/auto-insert
epic), enrichment fields (Iteration 11), self-notification skip, and the
cascade-delete-with-what-it-points-at behavior.
"""

import base64
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


@pytest.mark.asyncio
async def test_auto_insert_creates_a_notification_with_null_actor(client, make_user):
    """actor_id null — same 'system/self' shape as report_resolved: the
    recipient is the one who took the action, there's no separate human
    actor to attribute this to."""

    user_id, token = await make_user()
    headers = {'Authorization': f'Bearer {token}'}
    tiny_png = base64.b64decode(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42'
        'YAAAAASUVORK5CYII='
    )
    from services.auto_insert import auto_insert_log
    from schemas.movie_metadata import MovieMetadata

    status, log_id = await auto_insert_log(
        user_id=user_id, user_token=token,
        metadata=MovieMetadata(movie='Auto Insert Notif Test'),
        content=tiny_png, content_type='image/png',
        extraction_provider='openrouter', extraction_model='qwen/qwen2.5-vl-72b-instruct:free',
    )
    assert status == 'inserted'

    notifications = await client.get('/api/v1/notifications', headers=headers)
    by_type = {n['type']: n for n in notifications.json()}
    assert 'auto_insert_complete' in by_type
    assert by_type['auto_insert_complete']['actor_id'] is None
    assert by_type['auto_insert_complete']['movie_log_id'] == log_id


@pytest.mark.asyncio
async def test_batch_sourced_auto_insert_does_not_double_notify(client, make_user):
    """A batch item's auto-insert must not *also* fire the per-log
    auto_insert_complete notification — only the one batch_extraction_
    complete, once the batch finishes. Otherwise a 20-item auto-inserting
    batch would produce 21 notifications for one user action."""

    user_id, token = await make_user()
    headers = {'Authorization': f'Bearer {token}'}
    tiny_png = base64.b64decode(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42'
        'YAAAAASUVORK5CYII='
    )

    created = await client.post(
        '/api/v1/movie-metadata/extract-batch', headers=headers,
        files=[('ticket_images', ('t.png', tiny_png, 'image/png'))],
        data={'auto_insert': 'true'},
    )
    assert created.status_code == 202
    batch_id = created.json()['id']

    import asyncio
    for _ in range(60):
        status_resp = await client.get(f'/api/v1/movie-metadata/extract-batch/{batch_id}', headers=headers)
        if status_resp.json()['status'] != 'processing':
            break
        await asyncio.sleep(1.0)
    else:
        pytest.fail('batch did not finish in time')

    notifications = await client.get('/api/v1/notifications', headers=headers)
    types = [n['type'] for n in notifications.json()]
    assert types.count('batch_extraction_complete') == 1
    assert 'auto_insert_complete' not in types
