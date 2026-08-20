"""routers/movies.py — TMDB_API_KEY unconfigured -> CONFIG_ERROR (not a
crash), a real search/create round-trip against the actual TMDB API, and
a movie_id-linked log alongside the regression check that a log with no
movie_id still works exactly as before that feature existed.

Real TMDB calls below are NOT marked @pytest.mark.external the way
Google Places is — TMDB's API is genuinely free with no billing risk, so
there's no reason to make these opt-in the way a billed real call would
be. They're skipped (not marked opt-in) if TMDB_API_KEY isn't configured.
"""

import pytest
from config import settings
from conftest import theatre_place_payload


@pytest.mark.asyncio
async def test_search_500s_config_error_when_tmdb_key_unset(client, make_user, patch_settings):
    patch_settings(tmdb_api_key=None)
    _, token = await make_user()
    response = await client.post(
        '/api/v1/movies/search', headers={'Authorization': f'Bearer {token}'}, json={'query': 'Dune'},
    )
    assert response.status_code == 500
    assert response.json()['code'] == 'CONFIG_ERROR'


@pytest.mark.asyncio
async def test_real_tmdb_search_returns_well_shaped_candidates(client, make_user):
    """A real search against TMDB's actual catalog — the success path
    test_search_500s_config_error_when_tmdb_key_unset deliberately doesn't
    cover. Free API, no billing risk, so this runs by default rather than
    being opt-in like the Google Places equivalent."""

    if not settings.tmdb_api_key:
        pytest.skip('TMDB_API_KEY not configured in backend/.env')

    _, token = await make_user()
    response = await client.post(
        '/api/v1/movies/search', headers={'Authorization': f'Bearer {token}'}, json={'query': 'Inception'},
    )
    assert response.status_code == 200
    results = response.json()
    assert len(results) > 0
    assert any(r['title'] == 'Inception' for r in results)
    top = results[0]
    assert isinstance(top['tmdb_id'], int)
    assert isinstance(top['title'], str) and top['title']


@pytest.mark.asyncio
async def test_real_tmdb_create_movie_dedupes_by_tmdb_id(client, make_user):
    """POST /movies creates a catalog entry from a real tmdb_id, and a
    second call with the same tmdb_id returns the existing row instead of
    creating a duplicate — the dedup contract create_movie's own
    docstring promises."""

    if not settings.tmdb_api_key:
        pytest.skip('TMDB_API_KEY not configured in backend/.env')

    _, token = await make_user()
    headers = {'Authorization': f'Bearer {token}'}
    search = await client.post('/api/v1/movies/search', headers=headers, json={'query': 'Inception'})
    tmdb_id = next(r['tmdb_id'] for r in search.json() if r['title'] == 'Inception')

    first = await client.post('/api/v1/movies', headers=headers, json={'tmdb_id': tmdb_id})
    assert first.status_code == 201
    assert first.json()['title'] == 'Inception'

    second = await client.post('/api/v1/movies', headers=headers, json={'tmdb_id': tmdb_id})
    assert second.status_code == 201  # still 201, not a 409 — "create or return existing"
    assert second.json()['id'] == first.json()['id']  # same row, not a duplicate


@pytest.mark.asyncio
async def test_log_with_no_movie_id_still_works(client, make_user):
    """Regression check: a log with no catalog link at all must work
    exactly as before the movie-catalog feature existed."""

    _, token = await make_user()
    response = await client.post(
        '/api/v1/movie-logs', headers={'Authorization': f'Bearer {token}'},
        json={'movie': 'Free-Typed Only', 'theatre_place': theatre_place_payload()},
    )
    assert response.status_code == 201
    assert response.json()['movie_id'] is None


@pytest.mark.asyncio
async def test_movie_note_round_trip_and_privacy(client, make_user):
    """GET/PUT/DELETE /movies/{id}/note — same one-note-per-(entity,user),
    private, no-history-kept pattern as the theatre/screen note endpoints
    (test_venues.py's test_venue_note_independent_of_any_log). Distinct
    from movie_logs.notes (a field on one specific log)."""

    if not settings.tmdb_api_key:
        pytest.skip('TMDB_API_KEY not configured in backend/.env')

    _, owner_token = await make_user()
    _, other_token = await make_user()
    owner_headers = {'Authorization': f'Bearer {owner_token}'}
    other_headers = {'Authorization': f'Bearer {other_token}'}

    search = await client.post('/api/v1/movies/search', headers=owner_headers, json={'query': 'Inception'})
    tmdb_id = next(r['tmdb_id'] for r in search.json() if r['title'] == 'Inception')
    movie = await client.post('/api/v1/movies', headers=owner_headers, json={'tmdb_id': tmdb_id})
    movie_id = movie.json()['id']

    missing = await client.get(f'/api/v1/movies/{movie_id}/note', headers=owner_headers)
    assert missing.status_code == 404

    saved = await client.put(
        f'/api/v1/movies/{movie_id}/note', headers=owner_headers,
        json={'note': 'Wait for the OTT release.'},
    )
    assert saved.status_code == 200
    assert saved.json()['note'] == 'Wait for the OTT release.'
    assert saved.json()['movie_id'] == movie_id
    assert saved.json()['theatre_id'] is None
    assert saved.json()['screen_id'] is None

    fetched = await client.get(f'/api/v1/movies/{movie_id}/note', headers=owner_headers)
    assert fetched.status_code == 200
    assert fetched.json()['note'] == 'Wait for the OTT release.'

    overwritten = await client.put(
        f'/api/v1/movies/{movie_id}/note', headers=owner_headers, json={'note': 'Actually pretty good.'},
    )
    assert overwritten.status_code == 200
    assert overwritten.json()['note'] == 'Actually pretty good.'

    # Never shown to anyone else — no visibility tiers.
    as_other = await client.get(f'/api/v1/movies/{movie_id}/note', headers=other_headers)
    assert as_other.status_code == 404

    deleted = await client.delete(f'/api/v1/movies/{movie_id}/note', headers=owner_headers)
    assert deleted.status_code == 204

    gone = await client.get(f'/api/v1/movies/{movie_id}/note', headers=owner_headers)
    assert gone.status_code == 404

    delete_again = await client.delete(f'/api/v1/movies/{movie_id}/note', headers=owner_headers)
    assert delete_again.status_code == 404


@pytest.mark.asyncio
async def test_movie_stats_returns_null_not_404_when_nobody_has_rated_it(client):
    """avg_rating: null/rating_count: 0 for a movie that exists in the
    catalog but has no ratings yet, not a 404 — existing and having
    ratings are independent facts, per the router's own description."""

    response = await client.get('/api/v1/movies/00000000-0000-0000-0000-000000000000/stats')
    # A genuinely unknown movie_id still returns the null-shape default
    # rather than crashing — the router doesn't distinguish "exists with
    # no ratings" from "doesn't exist" for stats specifically.
    assert response.status_code == 200
    assert response.json()['avg_rating'] is None
    assert response.json()['rating_count'] == 0
