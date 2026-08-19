"""routers/movie_logs.py — CRUD, archive (+ the venue-stats trigger
case), favorites, search, punctuality, edited_at precision, and
extraction provenance. See plan.md's Iterations 6-8/14 bug inventory.
"""

import uuid

import pytest
from conftest import THEATRE_TEST_TAG


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
async def test_ticket_url_round_trip_and_scheme_validation(client, make_user):
    _, token = await make_user()
    headers = {'Authorization': f'Bearer {token}'}

    created = await client.post(
        '/api/v1/movie-logs', headers=headers,
        json={'movie': 'Ticket URL Test', 'ticket_url': 'https://in.bookmyshow.com/booking/abc123'},
    )
    assert created.status_code == 201
    assert created.json()['ticket_url'] == 'https://in.bookmyshow.com/booking/abc123'
    log_id = created.json()['id']

    invalid = await client.post(
        '/api/v1/movie-logs', headers=headers,
        json={'movie': 'Bad Ticket URL', 'ticket_url': 'not-a-url'},
    )
    assert invalid.status_code == 422

    updated = await client.patch(
        f'/api/v1/movie-logs/{log_id}', headers=headers,
        json={'ticket_url': 'https://www.fandango.com/orders/xyz'},
    )
    assert updated.status_code == 200
    assert updated.json()['ticket_url'] == 'https://www.fandango.com/orders/xyz'

    invalid_patch = await client.patch(
        f'/api/v1/movie-logs/{log_id}', headers=headers, json={'ticket_url': 'ftp://nope'},
    )
    assert invalid_patch.status_code == 422


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


@pytest.mark.asyncio
async def test_list_logs_movie_id_filter(client, make_user):
    from config import settings
    if not settings.tmdb_api_key:
        pytest.skip('TMDB_API_KEY not configured in backend/.env')

    _, token = await make_user()
    headers = {'Authorization': f'Bearer {token}'}
    search = await client.post('/api/v1/movies/search', headers=headers, json={'query': 'Inception'})
    tmdb_id = next(r['tmdb_id'] for r in search.json() if r['title'] == 'Inception')
    movie = await client.post('/api/v1/movies', headers=headers, json={'tmdb_id': tmdb_id})
    assert movie.status_code == 201
    movie_id = movie.json()['id']

    linked = await client.post(
        '/api/v1/movie-logs', headers=headers, json={'movie': 'Linked Log', 'movie_id': movie_id},
    )
    assert linked.status_code == 201
    unlinked = await client.post(
        '/api/v1/movie-logs', headers=headers, json={'movie': 'Unlinked Log'},
    )
    assert unlinked.status_code == 201

    filtered = await client.get(
        '/api/v1/movie-logs', headers=headers, params={'movie_id': movie_id},
    )
    assert filtered.status_code == 200
    ids = [l['id'] for l in filtered.json()]
    assert linked.json()['id'] in ids
    assert unlinked.json()['id'] not in ids


@pytest.mark.asyncio
async def test_theatre_place_reuses_an_existing_theatre_by_place_id(client, make_user):
    """resolve_or_create_theatre's place_id dedup path — never touches
    Google Places at all when the theatre already exists, so this doesn't
    need @pytest.mark.external."""

    _, token = await make_user()
    headers = {'Authorization': f'Bearer {token}'}
    place_id = f'movielog-place-{uuid.uuid4().hex[:8]}'
    theatre = await client.post(
        '/api/v1/venues/theatres', headers=headers,
        json={'name': f'Theatre Place Reuse{THEATRE_TEST_TAG}', 'place_id': place_id, 'city': 'X', 'country': 'US'},
    )
    assert theatre.status_code == 201
    theatre_id = theatre.json()['id']

    log = await client.post(
        '/api/v1/movie-logs', headers=headers,
        json={'movie': 'Theatre Place Reuse Log', 'theatre_place': {'place_id': place_id, 'name': 'Ignored'}},
    )
    assert log.status_code == 201
    assert log.json()['theatre_id'] == theatre_id  # reused, not a new row


@pytest.mark.asyncio
async def test_theatre_id_in_payload_wins_over_theatre_place(client, make_user):
    _, token = await make_user()
    headers = {'Authorization': f'Bearer {token}'}
    theatre = await client.post(
        '/api/v1/venues/theatres', headers=headers,
        json={'name': f'Theatre Id Wins{THEATRE_TEST_TAG}', 'place_id': f'wins-{uuid.uuid4().hex[:8]}', 'city': 'X', 'country': 'US'},
    )
    theatre_id = theatre.json()['id']

    log = await client.post(
        '/api/v1/movie-logs', headers=headers,
        json={
            'movie': 'Theatre Id Wins Log',
            'theatre_id': theatre_id,
            'theatre_place': {'place_id': f'ignored-{uuid.uuid4().hex[:8]}'},
        },
    )
    assert log.status_code == 201
    assert log.json()['theatre_id'] == theatre_id


@pytest.mark.external
@pytest.mark.asyncio
async def test_theatre_place_falls_back_and_creates_a_theatre_when_places_lookup_fails(
    client, make_user,
):
    """theatre_place has no `city` at all — a fake place_id (Places
    lookup fails, or Places isn't configured) must still land a real
    theatre row rather than a NOT NULL violation, defaulting city to
    'Unknown'. Marked external for the same reason
    test_create_theatre_falls_back_to_submitted_data_on_places_failure is:
    whenever GOOGLE_PLACES_API_KEY is configured, this makes a real
    (billed) lookup against a guaranteed-not-found id."""

    _, token = await make_user()
    headers = {'Authorization': f'Bearer {token}'}
    place_id = f'fake-movielog-{uuid.uuid4().hex[:8]}'

    log = await client.post(
        '/api/v1/movie-logs', headers=headers,
        json={
            'movie': 'Theatre Place Fallback Log',
            'theatre_place': {'place_id': place_id, 'name': f'Fallback Theatre{THEATRE_TEST_TAG}'},
        },
    )
    assert log.status_code == 201
    theatre_id = log.json()['theatre_id']
    assert theatre_id is not None

    theatre = await client.get(f'/api/v1/venues/theatres/{theatre_id}')
    assert theatre.status_code == 200
    assert theatre.json()['source'] == 'user_submitted'
    assert theatre.json()['city'] == 'Unknown'


@pytest.mark.asyncio
async def test_screen_resolved_by_name_under_a_theatre_and_reused(client, make_user):
    """No screen_id given, but a theatre was resolved (via theatre_id
    here) and `screen` is non-empty -> a screen gets created-or-reused by
    (theatre_id, name), same dedup key screens_theatre_id_name_key
    already enforces."""

    _, token = await make_user()
    headers = {'Authorization': f'Bearer {token}'}
    theatre = await client.post(
        '/api/v1/venues/theatres', headers=headers,
        json={'name': f'Screen Resolve Theatre{THEATRE_TEST_TAG}', 'place_id': f'screenres-{uuid.uuid4().hex[:8]}', 'city': 'X', 'country': 'US'},
    )
    theatre_id = theatre.json()['id']

    first = await client.post(
        '/api/v1/movie-logs', headers=headers,
        json={'movie': 'Screen Resolve Log 1', 'theatre_id': theatre_id, 'screen': 'Balcony'},
    )
    assert first.status_code == 201
    screen_id = first.json()['screen_id']
    assert screen_id is not None

    second = await client.post(
        '/api/v1/movie-logs', headers=headers,
        json={'movie': 'Screen Resolve Log 2', 'theatre_id': theatre_id, 'screen': 'Balcony'},
    )
    assert second.status_code == 201
    assert second.json()['screen_id'] == screen_id  # reused, not a duplicate row

    # An explicit screen_id always wins over resolving from `screen` text.
    other_screen = await client.post(
        f'/api/v1/venues/theatres/{theatre_id}/screens', headers=headers,
        json={'name': 'Explicit Screen'},
    )
    explicit_screen_id = other_screen.json()['id']
    third = await client.post(
        '/api/v1/movie-logs', headers=headers,
        json={
            'movie': 'Screen Resolve Log 3', 'theatre_id': theatre_id,
            'screen': 'Balcony', 'screen_id': explicit_screen_id,
        },
    )
    assert third.status_code == 201
    assert third.json()['screen_id'] == explicit_screen_id


@pytest.mark.asyncio
async def test_update_log_resolves_theatre_place_from_an_otherwise_empty_patch(client, make_user):
    """theatre_place is the only field sent on a PATCH -> not rejected as
    an empty patch, and it still resolves theatre_id."""

    _, token = await make_user()
    headers = {'Authorization': f'Bearer {token}'}
    place_id = f'patchonly-{uuid.uuid4().hex[:8]}'
    theatre = await client.post(
        '/api/v1/venues/theatres', headers=headers,
        json={'name': f'Patch Theatre Place{THEATRE_TEST_TAG}', 'place_id': place_id, 'city': 'X', 'country': 'US'},
    )
    theatre_id = theatre.json()['id']

    log = await client.post(
        '/api/v1/movie-logs', headers=headers, json={'movie': 'Patch Theatre Place Log'},
    )
    log_id = log.json()['id']
    assert log.json()['theatre_id'] is None

    patched = await client.patch(
        f'/api/v1/movie-logs/{log_id}', headers=headers,
        json={'theatre_place': {'place_id': place_id}},
    )
    assert patched.status_code == 200
    assert patched.json()['theatre_id'] == theatre_id

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

    from conftest import THEATRE_TEST_TAG
    theatre = await client.post(
        '/api/v1/venues/theatres', headers=headers,
        json={'name': f'Rating Delete Test Theatre{THEATRE_TEST_TAG}', 'place_id': f'ratedel-{uuid.uuid4().hex[:8]}', 'city': 'X', 'country': 'US'},
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


@pytest.mark.asyncio
async def test_get_venue_rating_round_trip_and_404s(client, make_user):
    _, token = await make_user()
    headers = {'Authorization': f'Bearer {token}'}
    log = await client.post(
        '/api/v1/movie-logs', headers=headers, json={'movie': 'Get Venue Rating Test'},
    )
    log_id = log.json()['id']

    # No rating stored yet.
    missing = await client.get(f'/api/v1/movie-logs/{log_id}/venue-rating', headers=headers)
    assert missing.status_code == 404

    upserted = await client.put(
        f'/api/v1/movie-logs/{log_id}/venue-rating', headers=headers,
        json={'screen_rating': 4.5, 'speaker_rating': 5.0, 'ac_rating': 3.5, 'seat_rating': 4.0},
    )
    assert upserted.status_code == 200

    fetched = await client.get(f'/api/v1/movie-logs/{log_id}/venue-rating', headers=headers)
    assert fetched.status_code == 200
    body = fetched.json()
    assert body['movie_log_id'] == log_id
    assert body['user_id']
    assert body['screen_rating'] == 4.5
    assert body['speaker_rating'] == 5.0
    assert body['ac_rating'] == 3.5
    assert body['seat_rating'] == 4.0
    assert body['created_at']
    assert body['updated_at']

    # After deleting, it's 404 again, not an empty/stale row.
    await client.delete(f'/api/v1/movie-logs/{log_id}/venue-rating', headers=headers)
    after_delete = await client.get(f'/api/v1/movie-logs/{log_id}/venue-rating', headers=headers)
    assert after_delete.status_code == 404


@pytest.mark.asyncio
async def test_get_venue_rating_404s_for_someone_elses_log(client, make_user):
    _, token_a = await make_user()
    _, token_b = await make_user()
    headers_a = {'Authorization': f'Bearer {token_a}'}
    headers_b = {'Authorization': f'Bearer {token_b}'}

    log = await client.post(
        '/api/v1/movie-logs', headers=headers_a, json={'movie': 'Other Users Venue Rating'},
    )
    log_id = log.json()['id']
    await client.put(
        f'/api/v1/movie-logs/{log_id}/venue-rating', headers=headers_a,
        json={'screen_rating': 4.0},
    )

    as_b = await client.get(f'/api/v1/movie-logs/{log_id}/venue-rating', headers=headers_b)
    assert as_b.status_code == 404  # RLS-scoped, not a leaked 403


@pytest.mark.asyncio
async def test_movie_log_photos_add_list_delete_round_trip(client, make_user):
    user_id, token = await make_user()
    headers = {'Authorization': f'Bearer {token}'}
    log = await client.post(
        '/api/v1/movie-logs', headers=headers, json={'movie': 'Photos Test'},
    )
    log_id = log.json()['id']

    empty_list = await client.get(f'/api/v1/movie-logs/{log_id}/photos', headers=headers)
    assert empty_list.status_code == 200
    assert empty_list.json() == []

    first = await client.post(
        f'/api/v1/movie-logs/{log_id}/photos', headers=headers,
        json={'storage_path': f'{user_id}/photo1.jpg', 'tag': 'theatre'},
    )
    assert first.status_code == 201
    first_body = first.json()
    assert first_body['movie_log_id'] == log_id
    assert first_body['user_id'] == user_id
    assert first_body['storage_path'] == f'{user_id}/photo1.jpg'
    assert first_body['tag'] == 'theatre'
    assert first_body['created_at']
    photo_id = first_body['id']

    second = await client.post(
        f'/api/v1/movie-logs/{log_id}/photos', headers=headers,
        json={'storage_path': f'{user_id}/photo2.jpg', 'tag': 'food'},
    )
    assert second.status_code == 201

    listed = await client.get(f'/api/v1/movie-logs/{log_id}/photos', headers=headers)
    assert listed.status_code == 200
    assert [p['tag'] for p in listed.json()] == ['theatre', 'food']  # oldest first

    deleted = await client.delete(
        f'/api/v1/movie-logs/{log_id}/photos/{photo_id}', headers=headers,
    )
    assert deleted.status_code == 204

    after_delete = await client.get(f'/api/v1/movie-logs/{log_id}/photos', headers=headers)
    assert [p['tag'] for p in after_delete.json()] == ['food']

    # Log itself, and the remaining photo, untouched.
    log_after = await client.get(f'/api/v1/movie-logs/{log_id}', headers=headers)
    assert log_after.status_code == 200

    # A second delete of the same photo 404s, doesn't silently no-op.
    second_delete = await client.delete(
        f'/api/v1/movie-logs/{log_id}/photos/{photo_id}', headers=headers,
    )
    assert second_delete.status_code == 404


@pytest.mark.asyncio
async def test_movie_log_photos_max_ten_enforced(client, make_user):
    user_id, token = await make_user()
    headers = {'Authorization': f'Bearer {token}'}
    log = await client.post(
        '/api/v1/movie-logs', headers=headers, json={'movie': 'Photo Limit Test'},
    )
    log_id = log.json()['id']

    for i in range(10):
        added = await client.post(
            f'/api/v1/movie-logs/{log_id}/photos', headers=headers,
            json={'storage_path': f'{user_id}/photo{i}.jpg', 'tag': 'other'},
        )
        assert added.status_code == 201

    eleventh = await client.post(
        f'/api/v1/movie-logs/{log_id}/photos', headers=headers,
        json={'storage_path': f'{user_id}/photo10.jpg', 'tag': 'other'},
    )
    assert eleventh.status_code == 400
    assert eleventh.json()['code'] == 'PHOTO_LIMIT_REACHED'

    listed = await client.get(f'/api/v1/movie-logs/{log_id}/photos', headers=headers)
    assert len(listed.json()) == 10  # the rejected 11th never landed


@pytest.mark.asyncio
async def test_movie_log_photos_rejects_path_outside_own_prefix(client, make_user):
    user_id, token = await make_user()
    headers = {'Authorization': f'Bearer {token}'}
    log = await client.post(
        '/api/v1/movie-logs', headers=headers, json={'movie': 'Photo Path Test'},
    )
    log_id = log.json()['id']

    someone_elses_prefix = await client.post(
        f'/api/v1/movie-logs/{log_id}/photos', headers=headers,
        json={'storage_path': 'not-my-user-id/photo.jpg', 'tag': 'other'},
    )
    assert someone_elses_prefix.status_code == 400
    assert someone_elses_prefix.json()['code'] == 'INVALID_IMAGE_PATH'


@pytest.mark.asyncio
async def test_movie_log_photos_404_for_someone_elses_log(client, make_user):
    user_id_a, token_a = await make_user()
    _, token_b = await make_user()
    headers_a = {'Authorization': f'Bearer {token_a}'}
    headers_b = {'Authorization': f'Bearer {token_b}'}

    log = await client.post(
        '/api/v1/movie-logs', headers=headers_a, json={'movie': 'Other Users Photos'},
    )
    log_id = log.json()['id']

    add_as_b = await client.post(
        f'/api/v1/movie-logs/{log_id}/photos', headers=headers_b,
        json={'storage_path': f'{user_id_a}/photo.jpg', 'tag': 'other'},
    )
    assert add_as_b.status_code == 404  # RLS-scoped, not a leaked 403

    list_as_b = await client.get(f'/api/v1/movie-logs/{log_id}/photos', headers=headers_b)
    assert list_as_b.status_code == 404
