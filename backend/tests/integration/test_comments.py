"""routers/comments.py — CRUD, one level of replies, soft-delete, and
the real Iteration 9 RLS regression: comment visibility/insert policies
must be gated by the log's own public/anonymous state, never by the
caller's own narrower RLS view of movie_logs (which is scoped to their
own rows + accounts they follow — a genuine stranger on a real public
log was wrongly rejected before the fix).
"""

import pytest


@pytest.mark.asyncio
async def test_comment_and_reply_round_trip_with_username(client, make_user):
    owner_id, owner_token = await make_user()
    commenter_id, commenter_token = await make_user()
    owner_headers = {'Authorization': f'Bearer {owner_token}'}
    commenter_headers = {'Authorization': f'Bearer {commenter_token}'}

    log = await client.post(
        '/api/v1/movie-logs', headers=owner_headers, json={'movie': 'Comment Test', 'visibility': 'public'},
    )
    log_id = log.json()['id']

    comment = await client.post(
        '/api/v1/comments', headers=commenter_headers, json={'movie_log_id': log_id, 'text': 'Great pick!'},
    )
    assert comment.status_code == 201
    comment_id = comment.json()['id']
    assert comment.json()['parent_comment_id'] is None

    reply = await client.post(
        '/api/v1/comments', headers=owner_headers,
        json={'movie_log_id': log_id, 'text': 'Thanks!', 'parent_comment_id': comment_id},
    )
    assert reply.status_code == 201

    listed = await client.get('/api/v1/comments', params={'movie_log_id': log_id})
    assert listed.status_code == 200
    assert len(listed.json()) == 1  # one top-level
    assert len(listed.json()[0]['replies']) == 1


@pytest.mark.asyncio
async def test_reply_to_a_reply_rejected(client, make_user):
    owner_id, owner_token = await make_user()
    other_id, other_token = await make_user()
    owner_headers = {'Authorization': f'Bearer {owner_token}'}
    other_headers = {'Authorization': f'Bearer {other_token}'}

    log = await client.post(
        '/api/v1/movie-logs', headers=owner_headers, json={'movie': 'Reply Depth Test', 'visibility': 'public'},
    )
    log_id = log.json()['id']
    top = await client.post(
        '/api/v1/comments', headers=other_headers, json={'movie_log_id': log_id, 'text': 'Top level'},
    )
    reply = await client.post(
        '/api/v1/comments', headers=owner_headers,
        json={'movie_log_id': log_id, 'text': 'A reply', 'parent_comment_id': top.json()['id']},
    )
    assert reply.status_code == 201

    reply_to_reply = await client.post(
        '/api/v1/comments', headers=other_headers,
        json={'movie_log_id': log_id, 'text': 'Reply to a reply', 'parent_comment_id': reply.json()['id']},
    )
    assert reply_to_reply.status_code == 403
    assert reply_to_reply.json()['code'] == 'COMMENT_NOT_ALLOWED'


@pytest.mark.asyncio
async def test_soft_delete_leaves_replies_intact(client, make_user):
    owner_id, owner_token = await make_user()
    other_id, other_token = await make_user()
    owner_headers = {'Authorization': f'Bearer {owner_token}'}
    other_headers = {'Authorization': f'Bearer {other_token}'}

    log = await client.post(
        '/api/v1/movie-logs', headers=owner_headers, json={'movie': 'Delete Test', 'visibility': 'public'},
    )
    log_id = log.json()['id']
    top = await client.post(
        '/api/v1/comments', headers=other_headers, json={'movie_log_id': log_id, 'text': 'Will be deleted'},
    )
    top_id = top.json()['id']
    await client.post(
        '/api/v1/comments', headers=owner_headers,
        json={'movie_log_id': log_id, 'text': 'Reply survives', 'parent_comment_id': top_id},
    )

    deleted = await client.delete(f'/api/v1/comments/{top_id}', headers=other_headers)
    assert deleted.status_code == 200
    assert deleted.json()['text'] is None
    assert deleted.json()['deleted_at'] is not None

    listed = await client.get('/api/v1/comments', params={'movie_log_id': log_id})
    assert listed.json()[0]['text'] is None
    assert len(listed.json()[0]['replies']) == 1
    assert listed.json()[0]['replies'][0]['text'] == 'Reply survives'


@pytest.mark.asyncio
async def test_commenting_on_a_private_log_404s(client, make_user):
    owner_id, owner_token = await make_user()
    other_id, other_token = await make_user()
    log = await client.post(
        '/api/v1/movie-logs', headers={'Authorization': f'Bearer {owner_token}'},
        json={'movie': 'Private No Comments', 'visibility': 'private'},
    )
    response = await client.post(
        '/api/v1/comments', headers={'Authorization': f'Bearer {other_token}'},
        json={'movie_log_id': log.json()['id'], 'text': 'Should not work'},
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_a_genuine_stranger_can_comment_on_a_real_public_log(client, make_user):
    """The exact Iteration 9 RLS regression: the log author's own
    account_visibility defaults to `private`, which is unrelated to
    whether the *log itself* is public — a stranger must still be able
    to comment on (and see comments on) a genuinely public log,
    regardless of the author's account-level privacy tier."""

    owner_id, owner_token = await make_user()
    stranger_id, stranger_token = await make_user()
    owner_headers = {'Authorization': f'Bearer {owner_token}'}
    stranger_headers = {'Authorization': f'Bearer {stranger_token}'}

    # Owner's account stays at its default (private) — never set to public.
    log = await client.post(
        '/api/v1/movie-logs', headers=owner_headers, json={'movie': 'RLS Regression Test', 'visibility': 'public'},
    )
    log_id = log.json()['id']

    comment = await client.post(
        '/api/v1/comments', headers=stranger_headers, json={'movie_log_id': log_id, 'text': 'A real stranger'},
    )
    assert comment.status_code == 201

    visible = await client.get('/api/v1/comments', params={'movie_log_id': log_id}, headers=stranger_headers)
    assert visible.status_code == 200
    assert len(visible.json()) == 1
