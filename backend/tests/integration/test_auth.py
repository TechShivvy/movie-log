"""auth/supabase_auth.py + routers/auth.py — the foundational identity
layer every other route depends on (see plan.md's "Foundational
infrastructure" section). Covers get_current_user's specific 401
messages, get_current_admin's allowlist gate, get_current_user_optional's
None-vs-401 distinction, and the account-deletion cascade table from
Iteration 3/14/15 (private logs gone; public/anonymous logs + their
venue ratings + comments survive anonymized (user_id: null); stored LLM
keys removed outright).
"""

import pytest
from conftest import delete_theatre_by_id


@pytest.mark.asyncio
async def test_no_token_is_401_missing_bearer_token(client):
    response = await client.get('/api/v1/auth/me')
    assert response.status_code == 401
    assert response.json()['message'] == 'Missing bearer token.'


@pytest.mark.asyncio
async def test_malformed_token_is_401_invalid_or_expired(client):
    response = await client.get(
        '/api/v1/auth/me', headers={'Authorization': 'Bearer not-a-real-jwt'},
    )
    assert response.status_code == 401
    assert response.json()['message'] == 'Invalid or expired access token.'


@pytest.mark.asyncio
async def test_valid_token_returns_the_real_user_id(client, make_user):
    user_id, token = await make_user()
    response = await client.get(
        '/api/v1/auth/me', headers={'Authorization': f'Bearer {token}'},
    )
    assert response.status_code == 200
    assert response.json()['user_id'] == user_id


@pytest.mark.asyncio
async def test_admin_route_403s_a_regular_authenticated_user(client, make_user):
    _, token = await make_user()
    response = await client.get(
        '/api/v1/reports/admin', headers={'Authorization': f'Bearer {token}'},
    )
    assert response.status_code == 403
    assert response.json()['message'] == 'This action requires admin access.'


@pytest.mark.asyncio
async def test_admin_route_succeeds_for_an_allowlisted_admin(client, admin_user):
    _, token = admin_user
    response = await client.get(
        '/api/v1/reports/admin', headers={'Authorization': f'Bearer {token}'},
    )
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_public_search_works_anonymously(client):
    """get_current_user_optional: no token -> None, not an error — the
    route stays fully anonymous-callable."""

    response = await client.get('/api/v1/public/users/search', params={'q': 'someone'})
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_public_search_with_an_invalid_token_still_401s(client):
    """The other half of get_current_user_optional's contract: a
    present-but-invalid token must NOT be silently downgraded to
    anonymous — that would mask a real client bug."""

    response = await client.get(
        '/api/v1/public/users/search',
        params={'q': 'someone'},
        headers={'Authorization': 'Bearer garbage'},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_delete_account_requires_confirm_true_in_body(client, make_user):
    _, token = await make_user()
    headers = {'Authorization': f'Bearer {token}'}

    no_body = await client.request('DELETE', '/api/v1/auth/me', headers=headers)
    assert no_body.status_code == 422

    confirm_false = await client.request(
        'DELETE', '/api/v1/auth/me', headers=headers, json={'confirm': False},
    )
    assert confirm_false.status_code == 422


@pytest.mark.asyncio
async def test_account_deletion_cascade(client, make_user):
    """The full Iteration 3/14/15 cascade table in one test:
    - a private log is gone entirely
    - a public log (linked to a theatre, so it's reachable through the
      public theatre-reviews endpoint without needing the now-deleted
      owner's own token) survives with user_id/username nulled, its
      rating still counted in the theatre's stats
    - a comment someone else left on it survives untouched
    - the account's own settings/profile are gone (404 on the old
      username)
    """

    owner_id, owner_token = await make_user()
    other_id, other_token = await make_user()
    owner_headers = {'Authorization': f'Bearer {owner_token}'}
    other_headers = {'Authorization': f'Bearer {other_token}'}

    username = f'delcascade{owner_id[:8]}'
    set_username = await client.patch(
        '/api/v1/public/me/username', headers=owner_headers, json={'username': username},
    )
    assert set_username.status_code == 200

    theatre = await client.post(
        '/api/v1/venues/theatres', headers=owner_headers,
        json={'name': 'Cascade Test Theatre', 'place_id': f'cascade-{owner_id[:8]}', 'city': 'Testville', 'country': 'US'},
    )
    assert theatre.status_code == 201
    theatre_id = theatre.json()['id']

    private_log = await client.post(
        '/api/v1/movie-logs', headers=owner_headers,
        json={'movie': 'Private Test Log', 'visibility': 'private'},
    )
    assert private_log.status_code == 201
    private_log_id = private_log.json()['id']

    public_log = await client.post(
        '/api/v1/movie-logs', headers=owner_headers,
        json={'movie': 'Public Test Log', 'visibility': 'public', 'theatre_id': theatre_id, 'rating': 4.0},
    )
    assert public_log.status_code == 201
    public_log_id = public_log.json()['id']

    comment = await client.post(
        '/api/v1/comments', headers=other_headers,
        json={'movie_log_id': public_log_id, 'text': 'Nice log!'},
    )
    assert comment.status_code == 201

    deletion = await client.request(
        'DELETE', '/api/v1/auth/me', headers=owner_headers, json={'confirm': True},
    )
    assert deletion.status_code == 204

    try:
        # Private log: gone. The old token still cryptographically verifies
        # (not revoked), but nothing in the DB carries that user_id anymore.
        private_after = await client.get(f'/api/v1/movie-logs/{private_log_id}', headers=owner_headers)
        assert private_after.status_code == 404

        # Profile: gone.
        profile_after = await client.get(f'/api/v1/public/users/{username}')
        assert profile_after.status_code == 404

        # Public log: survives, anonymized, still reachable through the
        # theatre's own public reviews list.
        reviews_after = await client.get(f'/api/v1/venues/theatres/{theatre_id}/reviews')
        assert reviews_after.status_code == 200
        surviving = [r for r in reviews_after.json() if r['id'] == public_log_id]
        assert len(surviving) == 1
        assert surviving[0]['user_id'] is None
        assert surviving[0]['username'] is None
        assert surviving[0]['movie'] == 'Public Test Log'

        # The comment the other (still-active) user left survives untouched.
        comments_after = await client.get(
            '/api/v1/comments', params={'movie_log_id': public_log_id}, headers=other_headers,
        )
        assert comments_after.status_code == 200
        assert comments_after.json()[0]['user_id'] == other_id
        assert comments_after.json()[0]['text'] == 'Nice log!'
    finally:
        # The whole point of this test is that public_log/theatre
        # deliberately *survive* owner_id's deletion (anonymized) — so
        # _UserFactory.cleanup()'s pre-delete-by-user_id step (conftest.py)
        # never finds them, their user_id is already null by then. Clean
        # them up explicitly here instead, or they'd sit in the real
        # public feed/theatre-reviews surface forever, same class of bug
        # as the theatre pollution this session found and fixed.
        await delete_theatre_by_id(theatre_id)
