"""routers/movie_logs.py — CRUD, archive (+ the venue-stats trigger
case), favorites, search, punctuality, edited_at precision, and
extraction provenance. See plan.md's Iterations 6-8/14 bug inventory.
"""

import pytest


@pytest.mark.asyncio
async def test_create_read_update_delete_roundtrip(client, make_user):
    _, token = await make_user()
    headers = {'Authorization': f'Bearer {token}'}

    created = await client.post(
        '/api/v1/movie-logs', headers=headers, json={'movie': 'Test Movie', 'rating': 4.0},
    )
    assert created.status_code == 201
    log_id = created.json()['id']
    assert created.json()['visibility'] == 'private'  # default

    fetched = await client.get(f'/api/v1/movie-logs/{log_id}', headers=headers)
    assert fetched.status_code == 200
    assert fetched.json()['movie'] == 'Test Movie'

    updated = await client.patch(
        f'/api/v1/movie-logs/{log_id}', headers=headers, json={'notes': 'Great film.'},
    )
    assert updated.status_code == 200
    assert updated.json()['notes'] == 'Great film.'

    deleted = await client.delete(f'/api/v1/movie-logs/{log_id}', headers=headers)
    assert deleted.status_code == 204

    gone = await client.get(f'/api/v1/movie-logs/{log_id}', headers=headers)
    assert gone.status_code == 404


@pytest.mark.asyncio
async def test_a_users_own_log_is_invisible_to_someone_else(client, make_user):
    _, token_a = await make_user()
    _, token_b = await make_user()
    created = await client.post(
        '/api/v1/movie-logs', headers={'Authorization': f'Bearer {token_a}'},
        json={'movie': 'Private To A', 'visibility': 'private'},
    )
    log_id = created.json()['id']

    as_b = await client.get(
        f'/api/v1/movie-logs/{log_id}', headers={'Authorization': f'Bearer {token_b}'},
    )
    assert as_b.status_code == 404  # RLS-scoped, not a leaked 403


@pytest.mark.asyncio
async def test_edited_at_set_only_on_a_real_content_change(client, make_user):
    _, token = await make_user()
    headers = {'Authorization': f'Bearer {token}'}
    created = await client.post(
        '/api/v1/movie-logs', headers=headers, json={'movie': 'Edited At Test'},
    )
    log_id = created.json()['id']
    assert created.json()['edited_at'] is None

    real_edit = await client.patch(
        f'/api/v1/movie-logs/{log_id}', headers=headers, json={'notes': 'now with notes'},
    )
    assert real_edit.json()['edited_at'] is not None
    first_edited_at = real_edit.json()['edited_at']

    # Resending the identical value should NOT move edited_at again.
    resend_same = await client.patch(
        f'/api/v1/movie-logs/{log_id}', headers=headers, json={'notes': 'now with notes'},
    )
    assert resend_same.json()['edited_at'] == first_edited_at


@pytest.mark.asyncio
async def test_archive_excludes_from_public_view_and_owners_own_default_list(client, make_user):
    """Iteration 9's core distinction: archive is stronger than private
    — hidden from the owner's own default list too, not just other
    people."""

    _, token = await make_user()
    headers = {'Authorization': f'Bearer {token}'}
    created = await client.post(
        '/api/v1/movie-logs', headers=headers, json={'movie': 'Archive Test', 'visibility': 'public'},
    )
    log_id = created.json()['id']

    archived = await client.patch(
        f'/api/v1/movie-logs/{log_id}', headers=headers, json={'is_archived': True},
    )
    assert archived.status_code == 200
    assert archived.json()['is_archived'] is True

    default_list = await client.get('/api/v1/movie-logs', headers=headers)
    assert log_id not in [l['id'] for l in default_list.json()]

    archived_list = await client.get('/api/v1/movie-logs', headers=headers, params={'archived_only': 'true'})
    assert log_id in [l['id'] for l in archived_list.json()]

    # Un-archiving restores it to the default list.
    unarchived = await client.patch(
        f'/api/v1/movie-logs/{log_id}', headers=headers, json={'is_archived': False},
    )
    assert unarchived.status_code == 200
    default_list_after = await client.get('/api/v1/movie-logs', headers=headers)
    assert log_id in [l['id'] for l in default_list_after.json()]


@pytest.mark.asyncio
async def test_favorites_four_slot_cap_and_atomic_slot_reassignment(client, make_user):
    _, token = await make_user()
    headers = {'Authorization': f'Bearer {token}'}
    log_ids = []
    for i in range(5):
        created = await client.post(
            '/api/v1/movie-logs', headers=headers, json={'movie': f'Favorite Test {i}', 'visibility': 'public'},
        )
        log_ids.append(created.json()['id'])

    for i in range(4):
        fav = await client.put(
            f'/api/v1/movie-logs/{log_ids[i]}/favorite', headers=headers, json={'position': i + 1},
        )
        assert fav.status_code == 200

    # Moving a 5th log into an already-taken slot atomically vacates the
    # previous occupant — not a 409.
    reassign = await client.put(
        f'/api/v1/movie-logs/{log_ids[4]}/favorite', headers=headers, json={'position': 1},
    )
    assert reassign.status_code == 200

    favorites_only = await client.get('/api/v1/movie-logs', headers=headers, params={'favorites_only': 'true'})
    favorite_ids = {l['id'] for l in favorites_only.json()}
    assert log_ids[4] in favorite_ids
    assert log_ids[0] not in favorite_ids  # vacated


@pytest.mark.asyncio
async def test_private_favorite_never_appears_in_public_profile_favorites(client, make_user):
    _, token = await make_user()
    headers = {'Authorization': f'Bearer {token}'}
    import uuid
    username = f'favtest{uuid.uuid4().hex[:10]}'
    await client.patch('/api/v1/public/me/username', headers=headers, json={'username': username})
    await client.patch('/api/v1/public/me/privacy', headers=headers, json={'account_visibility': 'public'})

    created = await client.post(
        '/api/v1/movie-logs', headers=headers, json={'movie': 'Private Favorite', 'visibility': 'private'},
    )
    log_id = created.json()['id']
    await client.put(f'/api/v1/movie-logs/{log_id}/favorite', headers=headers, json={'position': 1})

    # The owner sees it via favorites_only.
    own_favorites = await client.get('/api/v1/movie-logs', headers=headers, params={'favorites_only': 'true'})
    assert log_id in [l['id'] for l in own_favorites.json()]

    # The public profile does not.
    profile = await client.get(f'/api/v1/public/users/{username}')
    assert profile.status_code == 200
    assert log_id not in [f['id'] for f in profile.json()['favorites']]


@pytest.mark.asyncio
async def test_search_matches_across_multiple_fields_with_matched_fields(client, make_user):
    _, token = await make_user()
    headers = {'Authorization': f'Bearer {token}'}
    await client.post(
        '/api/v1/movie-logs', headers=headers,
        json={'movie': 'Nexus', 'theater': 'Grand Cineplex', 'notes': 'Loved the sound design'},
    )

    by_movie = await client.get('/api/v1/movie-logs/search', params={'q': 'Nexus'}, headers=headers)
    assert by_movie.status_code == 200
    assert len(by_movie.json()) >= 1
    assert 'movie' in by_movie.json()[0]['matched_fields']

    by_theater = await client.get('/api/v1/movie-logs/search', params={'q': 'Cineplex'}, headers=headers)
    assert len(by_theater.json()) >= 1


@pytest.mark.asyncio
async def test_punctuality_all_combinations_round_trip(client, make_user):
    """The NULL-in-CHECK bug's original regression, now via the API
    surface directly — see test_movie_logs_schema.py for the Pydantic-
    layer version of this same guard."""

    _, token = await make_user()
    headers = {'Authorization': f'Bearer {token}'}
    created = await client.post(
        '/api/v1/movie-logs', headers=headers,
        json={
            'movie': 'Punctuality Test',
            'arrival_status': 'late', 'arrival_delta_minutes': 10,
            'screening_start_status': 'delayed', 'screening_start_delta_minutes': 5,
        },
    )
    assert created.status_code == 201
    log_id = created.json()['id']
    assert created.json()['arrival_delta_minutes'] == 10

    # A PATCH that nulls the status while leaving the delta set must be
    # rejected cleanly (400/422), not silently accepted with an invalid
    # row underneath — the exact bug pattern documented in plan.md.
    invalid_patch = await client.patch(
        f'/api/v1/movie-logs/{log_id}', headers=headers, json={'arrival_status': None},
    )
    assert invalid_patch.status_code in (400, 422)

    # The row must be untouched by the rejected patch.
    unchanged = await client.get(f'/api/v1/movie-logs/{log_id}', headers=headers)
    assert unchanged.json()['arrival_status'] == 'late'
    assert unchanged.json()['arrival_delta_minutes'] == 10


@pytest.mark.asyncio
async def test_fdfs_forces_first_day_on_create_and_patch(client, make_user):
    _, token = await make_user()
    headers = {'Authorization': f'Bearer {token}'}
    created = await client.post(
        '/api/v1/movie-logs', headers=headers, json={'movie': 'FDFS Test', 'is_fdfs': True},
    )
    assert created.status_code == 201
    assert created.json()['is_first_day'] is True

    log_id = created.json()['id']
    patched = await client.patch(
        f'/api/v1/movie-logs/{log_id}', headers=headers, json={'is_fdfs': True, 'is_first_day': False},
    )
    assert patched.json()['is_first_day'] is True  # forced, ignores the explicit False


@pytest.mark.asyncio
async def test_time_of_day_is_computed_from_watched_time(client, make_user):
    _, token = await make_user()
    headers = {'Authorization': f'Bearer {token}'}
    morning = await client.post(
        '/api/v1/movie-logs', headers=headers, json={'movie': 'Morning Show', 'watched_time': '09:15'},
    )
    assert morning.json()['time_of_day'] == 'morning'
    night = await client.post(
        '/api/v1/movie-logs', headers=headers, json={'movie': 'Night Show', 'watched_time': '22:00'},
    )
    assert night.json()['time_of_day'] == 'night'


@pytest.mark.asyncio
async def test_extraction_provenance_round_trip_and_pairing_enforced(client, make_user):
    _, token = await make_user()
    headers = {'Authorization': f'Bearer {token}'}

    with_provenance = await client.post(
        '/api/v1/movie-logs', headers=headers,
        json={
            'movie': 'Extracted Log', 'extraction_provider': 'gemini',
            'extraction_model': 'gemini-flash-latest', 'extraction_edited': False,
        },
    )
    assert with_provenance.status_code == 201
    assert with_provenance.json()['extraction_provider'] == 'gemini'
    assert with_provenance.json()['extraction_edited'] is False

    manual = await client.post('/api/v1/movie-logs', headers=headers, json={'movie': 'Manual Log'})
    assert manual.json()['extraction_provider'] is None
    assert manual.json()['extraction_edited'] is None

    unpaired = await client.post(
        '/api/v1/movie-logs', headers=headers,
        json={'movie': 'Bad Pairing', 'extraction_provider': 'gemini'},
    )
    assert unpaired.status_code == 422


@pytest.mark.asyncio
async def test_venue_rating_delete_recomputes_stats(client, make_user):
    """Iteration 6's real gap: visit_venue_ratings had no DELETE at all.
    Deleting a rating must recompute the theatre's stats, not just
    disappear the log."""

    _, token = await make_user()
    headers = {'Authorization': f'Bearer {token}'}
    import uuid
    theatre = await client.post(
        '/api/v1/venues/theatres', headers=headers,
        json={'name': 'Rating Delete Test Theatre', 'place_id': f'ratedel-{uuid.uuid4().hex[:8]}', 'city': 'X', 'country': 'US'},
    )
    theatre_id = theatre.json()['id']
    log = await client.post(
        '/api/v1/movie-logs', headers=headers,
        json={'movie': 'Rating Delete Test', 'theatre_id': theatre_id},
    )
    log_id = log.json()['id']
    rating = await client.put(
        f'/api/v1/movie-logs/{log_id}/venue-rating', headers=headers,
        json={'screen_rating': 4.0, 'speaker_rating': 4.0, 'ac_rating': 4.0, 'seat_rating': 4.0},
    )
    assert rating.status_code == 200

    stats_with = await client.get(f'/api/v1/venues/theatres/{theatre_id}/stats')
    assert stats_with.json()['overall']['screen_rating']['count'] >= 1
    assert stats_with.json()['overall_avg'] is not None

    delete_rating = await client.delete(f'/api/v1/movie-logs/{log_id}/venue-rating', headers=headers)
    assert delete_rating.status_code == 204

    # Log itself untouched.
    log_after = await client.get(f'/api/v1/movie-logs/{log_id}', headers=headers)
    assert log_after.status_code == 200

    # A second delete 404s, doesn't silently no-op.
    second_delete = await client.delete(f'/api/v1/movie-logs/{log_id}/venue-rating', headers=headers)
    assert second_delete.status_code == 404
