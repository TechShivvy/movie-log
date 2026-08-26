"""routers/movie_logs.py + routers/comments.py's like endpoints —
Iteration 9's three real bugs: get_movie_log's wrong scope for reading
back someone else's like count, the double-like-404 (confusing "already
liked" with "doesn't exist"), and liked_by_caller being always-false on
5 of 6 read paths.
"""

import pytest
from conftest import theatre_place_payload


@pytest.mark.asyncio
async def test_liking_someone_elses_log_returns_the_correct_count(client, make_user):
    """The get_movie_log-wrong-scope bug: liking someone else's log used
    to read the count back through a caller-scoped lookup, which broke
    for the common case of liking anyone but yourself."""

    owner_id, owner_token = await make_user()
    liker_id, liker_token = await make_user()
    log = await client.post(
        '/api/v1/movie-logs', headers={'Authorization': f'Bearer {owner_token}'},
        json={'movie': 'Like Test', 'visibility': 'public', 'theatre_place': theatre_place_payload()},
    )
    log_id = log.json()['id']

    like = await client.post(
        f'/api/v1/movie-logs/{log_id}/like', headers={'Authorization': f'Bearer {liker_token}'},
    )
    assert like.status_code == 200
    assert like.json()['like_count'] == 1


@pytest.mark.asyncio
async def test_liking_twice_is_a_no_op_not_a_double_count(client, make_user):
    owner_id, owner_token = await make_user()
    liker_id, liker_token = await make_user()
    log = await client.post(
        '/api/v1/movie-logs', headers={'Authorization': f'Bearer {owner_token}'},
        json={'movie': 'Double Like Test', 'visibility': 'public', 'theatre_place': theatre_place_payload()},
    )
    log_id = log.json()['id']
    liker_headers = {'Authorization': f'Bearer {liker_token}'}

    first = await client.post(f'/api/v1/movie-logs/{log_id}/like', headers=liker_headers)
    assert first.json()['like_count'] == 1
    second = await client.post(f'/api/v1/movie-logs/{log_id}/like', headers=liker_headers)
    assert second.status_code == 200  # no-op, not an error
    assert second.json()['like_count'] == 1


@pytest.mark.asyncio
async def test_unliking_when_not_liked_is_a_no_op(client, make_user):
    owner_id, owner_token = await make_user()
    other_id, other_token = await make_user()
    log = await client.post(
        '/api/v1/movie-logs', headers={'Authorization': f'Bearer {owner_token}'},
        json={'movie': 'Unlike Noop Test', 'visibility': 'public', 'theatre_place': theatre_place_payload()},
    )
    log_id = log.json()['id']
    unlike = await client.delete(
        f'/api/v1/movie-logs/{log_id}/like', headers={'Authorization': f'Bearer {other_token}'},
    )
    assert unlike.status_code == 200
    assert unlike.json()['like_count'] == 0


@pytest.mark.asyncio
async def test_double_comment_like_is_a_no_op_not_a_404(client, make_user):
    """The specific bug: a duplicate comment-like used to collapse to
    the same 400/404 as a genuinely missing comment_id."""

    owner_id, owner_token = await make_user()
    commenter_id, commenter_token = await make_user()
    log = await client.post(
        '/api/v1/movie-logs', headers={'Authorization': f'Bearer {owner_token}'},
        json={'movie': 'Comment Like Test', 'visibility': 'public', 'theatre_place': theatre_place_payload()},
    )
    comment = await client.post(
        '/api/v1/comments', headers={'Authorization': f'Bearer {commenter_token}'},
        json={'movie_log_id': log.json()['id'], 'text': 'Like me'},
    )
    comment_id = comment.json()['id']
    owner_headers = {'Authorization': f'Bearer {owner_token}'}

    first = await client.post(f'/api/v1/comments/{comment_id}/like', headers=owner_headers)
    assert first.status_code == 200
    assert first.json()['like_count'] == 1

    second = await client.post(f'/api/v1/comments/{comment_id}/like', headers=owner_headers)
    assert second.status_code == 200  # no-op, NOT a 404
    assert second.json()['like_count'] == 1


@pytest.mark.asyncio
async def test_liking_a_genuinely_nonexistent_comment_is_a_real_404(client, make_user):
    """The other half of the same fix — a truly missing comment must
    still 404, distinguishable from the no-op-duplicate case above."""

    _, token = await make_user()
    response = await client.post(
        '/api/v1/comments/00000000-0000-0000-0000-000000000000/like',
        headers={'Authorization': f'Bearer {token}'},
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_liked_by_caller_correct_on_own_profile_logs(client, make_user):
    """One of the 5 previously-always-false read paths — profile logs."""

    import uuid
    owner_id, owner_token = await make_user()
    owner_headers = {'Authorization': f'Bearer {owner_token}'}
    username = f'liketest{uuid.uuid4().hex[:10]}'
    await client.patch('/api/v1/public/me/username', headers=owner_headers, json={'username': username})
    await client.patch('/api/v1/public/me/privacy', headers=owner_headers, json={'account_visibility': 'public'})

    log = await client.post(
        '/api/v1/movie-logs', headers=owner_headers,
        json={'movie': 'Liked By Caller Test', 'visibility': 'public', 'theatre_place': theatre_place_payload()},
    )
    log_id = log.json()['id']
    await client.post(f'/api/v1/movie-logs/{log_id}/like', headers=owner_headers)

    profile = await client.get(f'/api/v1/public/users/{username}', headers=owner_headers)
    matching = [l for l in profile.json()['logs'] if l['id'] == log_id]
    assert len(matching) == 1
    assert matching[0]['liked_by_caller'] is True

    # A different viewer, and an anonymous caller, must both see False —
    # not True, and not a crash.
    _, other_token = await make_user()
    as_other = await client.get(
        f'/api/v1/public/users/{username}', headers={'Authorization': f'Bearer {other_token}'},
    )
    other_matching = [l for l in as_other.json()['logs'] if l['id'] == log_id]
    assert other_matching[0]['liked_by_caller'] is False

    anon = await client.get(f'/api/v1/public/users/{username}')
    anon_matching = [l for l in anon.json()['logs'] if l['id'] == log_id]
    assert anon_matching[0]['liked_by_caller'] is False


@pytest.mark.asyncio
async def test_liking_a_private_log_404s(client, make_user):
    owner_id, owner_token = await make_user()
    other_id, other_token = await make_user()
    log = await client.post(
        '/api/v1/movie-logs', headers={'Authorization': f'Bearer {owner_token}'},
        json={'movie': 'Private Like Test', 'visibility': 'private', 'theatre_place': theatre_place_payload()},
    )
    response = await client.post(
        f'/api/v1/movie-logs/{log.json()["id"]}/like', headers={'Authorization': f'Bearer {other_token}'},
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_list_log_likes_returns_likers_most_recent_first(client, make_user):
    owner_id, owner_token = await make_user()
    liker_a_id, liker_a_token = await make_user()
    liker_b_id, liker_b_token = await make_user()
    log = await client.post(
        '/api/v1/movie-logs', headers={'Authorization': f'Bearer {owner_token}'},
        json={'movie': 'List Likes Test', 'visibility': 'public', 'theatre_place': theatre_place_payload()},
    )
    log_id = log.json()['id']

    await client.post(f'/api/v1/movie-logs/{log_id}/like', headers={'Authorization': f'Bearer {liker_a_token}'})
    await client.post(f'/api/v1/movie-logs/{log_id}/like', headers={'Authorization': f'Bearer {liker_b_token}'})

    # Public — no sign-in required.
    likers = await client.get(f'/api/v1/movie-logs/{log_id}/likes')
    assert likers.status_code == 200
    body = likers.json()
    assert len(body) == 2
    assert [entry['user_id'] for entry in body] == [liker_b_id, liker_a_id]  # most recent first
    assert all('liked_at' in entry for entry in body)


@pytest.mark.asyncio
async def test_list_log_likes_visible_to_owner_after_going_private_not_to_a_stranger(client, make_user):
    """Same gate as the log's own GET: a like made while the log was
    public survives a later switch to private, still visible to the
    owner, no longer visible to anyone else — including anonymously."""

    owner_id, owner_token = await make_user()
    liker_id, liker_token = await make_user()
    stranger_id, stranger_token = await make_user()
    owner_headers = {'Authorization': f'Bearer {owner_token}'}
    log = await client.post(
        '/api/v1/movie-logs', headers=owner_headers,
        json={'movie': 'Likes Privacy Test', 'visibility': 'public', 'theatre_place': theatre_place_payload()},
    )
    log_id = log.json()['id']
    await client.post(f'/api/v1/movie-logs/{log_id}/like', headers={'Authorization': f'Bearer {liker_token}'})

    made_private = await client.patch(
        f'/api/v1/movie-logs/{log_id}', headers=owner_headers, json={'visibility': 'private'},
    )
    assert made_private.status_code == 200

    as_owner = await client.get(f'/api/v1/movie-logs/{log_id}/likes', headers=owner_headers)
    assert as_owner.status_code == 200
    assert [entry['user_id'] for entry in as_owner.json()] == [liker_id]

    as_stranger = await client.get(
        f'/api/v1/movie-logs/{log_id}/likes', headers={'Authorization': f'Bearer {stranger_token}'},
    )
    assert as_stranger.status_code == 200
    assert as_stranger.json() == []

    anon = await client.get(f'/api/v1/movie-logs/{log_id}/likes')
    assert anon.status_code == 200
    assert anon.json() == []


@pytest.mark.asyncio
async def test_list_comment_likes_returns_likers(client, make_user):
    owner_id, owner_token = await make_user()
    commenter_id, commenter_token = await make_user()
    owner_headers = {'Authorization': f'Bearer {owner_token}'}
    log = await client.post(
        '/api/v1/movie-logs', headers=owner_headers,
        json={'movie': 'Comment Likes List Test', 'visibility': 'public', 'theatre_place': theatre_place_payload()},
    )
    comment = await client.post(
        '/api/v1/comments', headers={'Authorization': f'Bearer {commenter_token}'},
        json={'movie_log_id': log.json()['id'], 'text': 'Worth a like'},
    )
    comment_id = comment.json()['id']
    await client.post(f'/api/v1/comments/{comment_id}/like', headers=owner_headers)

    likers = await client.get(f'/api/v1/comments/{comment_id}/likes')
    assert likers.status_code == 200
    body = likers.json()
    assert len(body) == 1
    assert body[0]['user_id'] == owner_id
    assert 'liked_at' in body[0]
