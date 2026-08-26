"""routers/follows.py — follow lifecycle, block's 4 documented effects,
and the list_followers missing-LEFT-JOIN regression from Iteration 2.
"""

import uuid

import pytest
from conftest import theatre_place_payload


async def _set_username_and_privacy(client, headers, visibility='public'):
    username = f'flw{uuid.uuid4().hex[:12]}'
    resp = await client.patch('/api/v1/public/me/username', headers=headers, json={'username': username})
    assert resp.status_code == 200
    priv = await client.patch('/api/v1/public/me/privacy', headers=headers, json={'account_visibility': visibility})
    assert priv.status_code == 200
    return username


@pytest.mark.asyncio
async def test_follow_public_account_instant_accept(client, make_user):
    _, follower_token = await make_user()
    _, target_token = await make_user()
    target_username = await _set_username_and_privacy(client, {'Authorization': f'Bearer {target_token}'}, 'public')

    follow = await client.post(
        f'/api/v1/public/follows/{target_username}', headers={'Authorization': f'Bearer {follower_token}'},
    )
    assert follow.status_code == 200
    assert follow.json()['status'] == 'accepted'


@pytest.mark.asyncio
async def test_follow_private_account_pending_then_accept(client, make_user):
    follower_id, follower_token = await make_user()
    _, target_token = await make_user()
    target_username = await _set_username_and_privacy(client, {'Authorization': f'Bearer {target_token}'}, 'private')

    follow = await client.post(
        f'/api/v1/public/follows/{target_username}', headers={'Authorization': f'Bearer {follower_token}'},
    )
    assert follow.status_code == 200
    assert follow.json()['status'] == 'pending'

    follower_username = await _set_username_and_privacy(
        client, {'Authorization': f'Bearer {follower_token}'}, 'public',
    )
    accept = await client.post(
        f'/api/v1/public/follows/{follower_username}/accept', headers={'Authorization': f'Bearer {target_token}'},
    )
    assert accept.status_code == 200
    assert accept.json()['status'] == 'accepted'


@pytest.mark.asyncio
async def test_self_follow_rejected(client, make_user):
    _, token = await make_user()
    username = await _set_username_and_privacy(client, {'Authorization': f'Bearer {token}'})
    response = await client.post(f'/api/v1/public/follows/{username}', headers={'Authorization': f'Bearer {token}'})
    assert response.status_code == 400
    assert response.json()['code'] == 'SELF_FOLLOW'


@pytest.mark.asyncio
async def test_private_account_stays_invisible_even_to_an_accepted_follower(client, make_user):
    """The Iteration 2 design decision: `private` is genuinely stronger
    than `followers_only` — zero content access even once accepted."""

    _, follower_token = await make_user()
    owner_id, owner_token = await make_user()
    owner_headers = {'Authorization': f'Bearer {owner_token}'}
    follower_headers = {'Authorization': f'Bearer {follower_token}'}
    owner_username = await _set_username_and_privacy(client, owner_headers, 'private')
    follower_username = await _set_username_and_privacy(client, follower_headers, 'public')

    await client.post(
        '/api/v1/movie-logs', headers=owner_headers,
        json={'movie': 'Private Account Log', 'visibility': 'public', 'theatre_place': theatre_place_payload()},
    )

    follow = await client.post(f'/api/v1/public/follows/{owner_username}', headers=follower_headers)
    assert follow.json()['status'] == 'pending'
    accept = await client.post(f'/api/v1/public/follows/{follower_username}/accept', headers=owner_headers)
    assert accept.status_code == 200
    assert accept.json()['status'] == 'accepted'

    # Accepted follower — still zero content access, because the account
    # is `private`, not `followers_only`.
    profile_still_private = await client.get(f'/api/v1/public/users/{owner_username}', headers=follower_headers)
    assert profile_still_private.json()['logs'] == []
    assert profile_still_private.json()['profile']['can_view_content'] is False


@pytest.mark.asyncio
async def test_switching_private_to_followers_only_unlocks_content_with_no_new_follow(client, make_user):
    """The specific sequence Iteration 2 verified live: an ALREADY-
    accepted follower's access unlocks the moment the account leaves
    `private`, with no new follow action taken."""

    follower_id, follower_token = await make_user()
    owner_id, owner_token = await make_user()
    owner_headers = {'Authorization': f'Bearer {owner_token}'}
    follower_headers = {'Authorization': f'Bearer {follower_token}'}

    owner_username = await _set_username_and_privacy(client, owner_headers, 'followers_only')
    await client.post(
        '/api/v1/movie-logs', headers=owner_headers,
        json={'movie': 'Unlock Test Log', 'visibility': 'public', 'theatre_place': theatre_place_payload()},
    )
    follower_username = await _set_username_and_privacy(client, follower_headers, 'public')

    follow = await client.post(f'/api/v1/public/follows/{owner_username}', headers=follower_headers)
    assert follow.json()['status'] == 'pending'
    accept = await client.post(f'/api/v1/public/follows/{follower_username}/accept', headers=owner_headers)
    assert accept.status_code == 200

    # Now switch to private — should re-lock.
    await client.patch('/api/v1/public/me/privacy', headers=owner_headers, json={'account_visibility': 'private'})
    locked = await client.get(f'/api/v1/public/users/{owner_username}', headers=follower_headers)
    assert locked.json()['profile']['can_view_content'] is False

    # Switch back to followers_only — NO new follow action — content unlocks immediately.
    await client.patch(
        '/api/v1/public/me/privacy', headers=owner_headers, json={'account_visibility': 'followers_only'},
    )
    unlocked = await client.get(f'/api/v1/public/users/{owner_username}', headers=follower_headers)
    assert unlocked.json()['profile']['can_view_content'] is True
    assert len(unlocked.json()['logs']) == 1


@pytest.mark.asyncio
async def test_block_severs_existing_follow_and_rejects_new_ones_both_directions(client, make_user):
    follower_id, follower_token = await make_user()
    target_id, target_token = await make_user()
    follower_headers = {'Authorization': f'Bearer {follower_token}'}
    target_headers = {'Authorization': f'Bearer {target_token}'}

    target_username = await _set_username_and_privacy(client, target_headers, 'public')
    follower_username = await _set_username_and_privacy(client, follower_headers, 'public')

    follow = await client.post(f'/api/v1/public/follows/{target_username}', headers=follower_headers)
    assert follow.json()['status'] == 'accepted'

    block = await client.post(f'/api/v1/public/blocks/{follower_username}', headers=target_headers)
    assert block.status_code == 200

    # GET /users/{username} still resolves for either party — a block must
    # never be distinguishable from a real "nothing to see here" account —
    # but content is masked exactly like a private account: can_view_content
    # false, logs/favorites empty, even though both accounts are `public`.
    as_follower = await client.get(f'/api/v1/public/users/{target_username}', headers=follower_headers)
    assert as_follower.status_code == 200
    assert as_follower.json()['profile']['can_view_content'] is False
    assert as_follower.json()['logs'] == []
    as_target = await client.get(f'/api/v1/public/users/{follower_username}', headers=target_headers)
    assert as_target.status_code == 200
    assert as_target.json()['profile']['can_view_content'] is False

    # A fresh follow attempt in either direction fails with the same
    # generic conflict a real race condition would also produce — never a
    # response that confirms a block exists.
    re_follow = await client.post(f'/api/v1/public/follows/{target_username}', headers=follower_headers)
    assert re_follow.status_code == 409
    assert re_follow.json()['code'] == 'FOLLOW_CONFLICT'
    reverse_follow = await client.post(f'/api/v1/public/follows/{follower_username}', headers=target_headers)
    assert reverse_follow.status_code == 409
    assert reverse_follow.json()['code'] == 'FOLLOW_CONFLICT'

    # Excluded from each other's authenticated search.
    search_as_target = await client.get(
        '/api/v1/public/users/search', params={'q': follower_username[:6]}, headers=target_headers,
    )
    assert follower_username not in [u['username'] for u in search_as_target.json()]


@pytest.mark.asyncio
async def test_list_blocks_and_unblock(client, make_user):
    blocker_id, blocker_token = await make_user()
    blocked_id, blocked_token = await make_user()
    blocker_headers = {'Authorization': f'Bearer {blocker_token}'}
    blocked_headers = {'Authorization': f'Bearer {blocked_token}'}

    blocker_username = await _set_username_and_privacy(client, blocker_headers, 'public')
    blocked_username = await _set_username_and_privacy(client, blocked_headers, 'public')

    empty = await client.get('/api/v1/public/blocks', headers=blocker_headers)
    assert empty.status_code == 200
    assert empty.json() == []

    block = await client.post(f'/api/v1/public/blocks/{blocked_username}', headers=blocker_headers)
    assert block.status_code == 200

    listed = await client.get('/api/v1/public/blocks', headers=blocker_headers)
    assert listed.status_code == 200
    assert [u['username'] for u in listed.json()] == [blocked_username]

    # The blocked party has no way to see this list at all — it's not
    # their own blocks, and blocks RLS only lets the blocker read theirs.
    as_blocked = await client.get('/api/v1/public/blocks', headers=blocked_headers)
    assert as_blocked.status_code == 200
    assert as_blocked.json() == []

    # `is_blocking` on the blocked party's own view of the blocker's
    # profile stays false — it's caller-directional, they never placed it.
    as_blocked_profile = await client.get(f'/api/v1/public/users/{blocker_username}', headers=blocked_headers)
    assert as_blocked_profile.json()['profile']['is_blocking'] is False
    as_blocker_profile = await client.get(f'/api/v1/public/users/{blocked_username}', headers=blocker_headers)
    assert as_blocker_profile.json()['profile']['is_blocking'] is True

    unblock = await client.delete(f'/api/v1/public/blocks/{blocked_username}', headers=blocker_headers)
    assert unblock.status_code == 200

    after_unblock = await client.get('/api/v1/public/blocks', headers=blocker_headers)
    assert after_unblock.json() == []
    # Content is visible again now that the block is gone.
    restored = await client.get(f'/api/v1/public/users/{blocked_username}', headers=blocker_headers)
    assert restored.json()['profile']['can_view_content'] is True


@pytest.mark.asyncio
async def test_list_followers_includes_a_follower_with_no_username_set(client, make_user):
    """The Iteration 2 regression: list_followers was silently dropping
    an accepted follower who never set a username (missing LEFT JOIN)."""

    follower_id, follower_token = await make_user()  # deliberately never sets a username
    target_id, target_token = await make_user()
    target_headers = {'Authorization': f'Bearer {target_token}'}
    target_username = await _set_username_and_privacy(client, target_headers, 'public')

    follow = await client.post(
        f'/api/v1/public/follows/{target_username}', headers={'Authorization': f'Bearer {follower_token}'},
    )
    assert follow.json()['status'] == 'accepted'

    followers = await client.get(f'/api/v1/public/users/{target_username}/followers', headers=target_headers)
    assert followers.status_code == 200
    assert follower_id in [f['user_id'] for f in followers.json()]
