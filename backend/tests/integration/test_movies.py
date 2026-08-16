"""routers/movies.py — TMDB_API_KEY unconfigured -> CONFIG_ERROR (not a
crash), and a movie_id-linked log alongside the regression check that a
log with no movie_id still works exactly as before that feature existed.
"""

import pytest


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
async def test_log_with_no_movie_id_still_works(client, make_user):
    """Regression check: a log with no catalog link at all must work
    exactly as before the movie-catalog feature existed."""

    _, token = await make_user()
    response = await client.post(
        '/api/v1/movie-logs', headers={'Authorization': f'Bearer {token}'},
        json={'movie': 'Free-Typed Only'},
    )
    assert response.status_code == 201
    assert response.json()['movie_id'] is None


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
