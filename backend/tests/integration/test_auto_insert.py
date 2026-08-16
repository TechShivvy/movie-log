"""Auto-insert-after-extraction (services/auto_insert.py,
routers/movie_metadata.py's apply_auto_insert). Two kinds of test here:

- Direct calls to auto_insert_log() with a *constructed* MovieMetadata
  (movie='...' set explicitly) for anything that needs to assert on a
  specific inserted row's fields — a real tiny test image extracted for
  real by a free model won't reliably produce any particular movie
  title, so asserting "the log has these exact fields" has to bypass
  that unpredictability, not depend on it. Still fully real: a real
  Storage upload, a real create_movie_log() call against the linked
  project.
- Real HTTP calls through /extract for the *resolution chain* (explicit
  param vs stored default, cache-hit-still-runs-fresh) — these only ever
  assert auto_insert_status is not None (attempted) vs None (not
  attempted), which holds regardless of what the model actually
  extracted, so they don't depend on real image content either.
"""

import base64

import pytest
from conftest import real_ticket_image_bytes
from schemas.movie_metadata import MovieMetadata
from services.auto_insert import auto_insert_log

# Only used for the direct auto_insert_log() calls below, which never go
# through a real LLM call at all — the metadata is constructed by hand,
# so the actual image content is irrelevant there. Any test going
# through the real /extract HTTP path uses real_ticket_image_bytes()
# instead — a blank/featureless image is now correctly rejected as
# NOT_A_TICKET (schemas/movie_metadata.py), confirmed live, so it can no
# longer stand in for "a real ticket" in those tests.
_TINY_PNG = base64.b64decode(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42'
    'YAAAAASUVORK5CYII='
)


@pytest.mark.asyncio
async def test_auto_insert_log_creates_a_real_log_with_correct_fields(client, make_user):
    user_id, token = await make_user()
    metadata = MovieMetadata(
        movie='Direct Service Test', date='2026-08-10', time='21:30', theater='PVR',
    )

    status, log_id = await auto_insert_log(
        user_id=user_id, user_token=token, metadata=metadata,
        content=_TINY_PNG, content_type='image/png',
        extraction_provider='openrouter', extraction_model='qwen/qwen2.5-vl-72b-instruct:free',
    )
    assert status == 'inserted'
    assert log_id is not None

    fetched = await client.get(f'/api/v1/movie-logs/{log_id}', headers={'Authorization': f'Bearer {token}'})
    assert fetched.status_code == 200
    body = fetched.json()
    assert body['movie'] == 'Direct Service Test'
    assert body['watched_date'] == '2026-08-10'
    assert body['watched_time'] == '21:30'
    assert body['extraction_provider'] == 'openrouter'
    assert body['extraction_model'] == 'qwen/qwen2.5-vl-72b-instruct:free'
    assert body['extraction_edited'] is False
    assert body['ticket_image_path'].startswith(f'{user_id}/')
    assert body['visibility'] == 'private'  # MovieLogInput's own default, unaffected by auto-insert


@pytest.mark.asyncio
async def test_auto_insert_log_with_no_content_leaves_no_ticket_image_path(client, make_user):
    """The /extract-from-link path — no image at all, content=None."""

    user_id, token = await make_user()
    metadata = MovieMetadata(movie='Link Extraction Test')

    status, log_id = await auto_insert_log(
        user_id=user_id, user_token=token, metadata=metadata,
        content=None, content_type=None,
        extraction_provider='openrouter', extraction_model='qwen/qwen2.5-vl-72b-instruct:free',
    )
    assert status == 'inserted'
    fetched = await client.get(f'/api/v1/movie-logs/{log_id}', headers={'Authorization': f'Bearer {token}'})
    assert fetched.json()['ticket_image_path'] is None


@pytest.mark.asyncio
async def test_auto_insert_log_cannot_be_spoofed_via_writable_fields(client, make_user):
    """auto_inserted/extraction_batch_id are backend-only markers — a
    regular POST /movie-logs call (going through MovieLogInput/
    WRITABLE_FIELDS, not this service function) must never be able to
    set them, since they're not part of that schema at all."""

    user_id, token = await make_user()
    response = await client.post(
        '/api/v1/movie-logs', headers={'Authorization': f'Bearer {token}'},
        json={'movie': 'Spoof Test', 'auto_inserted': True, 'extraction_batch_id': 'not-even-a-uuid'},
    )
    assert response.status_code == 201
    assert response.json().get('auto_inserted') is not True


@pytest.mark.asyncio
async def test_extract_auto_insert_false_or_omitted_does_not_attempt_insert(client, make_user):
    _, token = await make_user()
    headers = {'Authorization': f'Bearer {token}'}

    omitted = await client.post(
        '/api/v1/movie-metadata/extract', headers=headers,
        files={'ticket_image': ('ticket-1.png', real_ticket_image_bytes(), 'image/png')},
    )
    assert omitted.status_code == 200
    assert omitted.json()['auto_insert_status'] is None
    assert omitted.json()['movie_log_id'] is None

    explicit_false = await client.post(
        '/api/v1/movie-metadata/extract', headers=headers,
        files={'ticket_image': ('ticket-1.png', real_ticket_image_bytes(), 'image/png')},
        data={'auto_insert': 'false'},
    )
    assert explicit_false.json()['auto_insert_status'] is None


@pytest.mark.asyncio
async def test_extract_auto_insert_explicit_true_is_attempted(client, make_user):
    _, token = await make_user()
    headers = {'Authorization': f'Bearer {token}'}
    response = await client.post(
        '/api/v1/movie-metadata/extract', headers=headers,
        files={'ticket_image': ('ticket-1.png', real_ticket_image_bytes(), 'image/png')},
        data={'auto_insert': 'true'},
    )
    assert response.status_code == 200
    # skipped_no_title / inserted / failed are all "attempted" outcomes —
    # what matters here is that it's not None (never even tried).
    assert response.json()['auto_insert_status'] is not None


@pytest.mark.asyncio
async def test_extract_auto_insert_uses_stored_profile_default_when_omitted(client, make_user):
    _, token = await make_user()
    headers = {'Authorization': f'Bearer {token}'}
    pref = await client.patch(
        '/api/v1/public/me/auto-insert-preference', headers=headers, json={'auto_insert_extractions': True},
    )
    assert pref.status_code == 200
    assert pref.json()['auto_insert_extractions'] is True

    response = await client.post(
        '/api/v1/movie-metadata/extract', headers=headers,
        files={'ticket_image': ('ticket-1.png', real_ticket_image_bytes(), 'image/png')},
    )
    assert response.json()['auto_insert_status'] is not None  # attempted, from the stored default alone


@pytest.mark.asyncio
async def test_extract_auto_insert_explicit_false_overrides_stored_true_default(client, make_user):
    _, token = await make_user()
    headers = {'Authorization': f'Bearer {token}'}
    await client.patch(
        '/api/v1/public/me/auto-insert-preference', headers=headers, json={'auto_insert_extractions': True},
    )
    response = await client.post(
        '/api/v1/movie-metadata/extract', headers=headers,
        files={'ticket_image': ('ticket-1.png', real_ticket_image_bytes(), 'image/png')},
        data={'auto_insert': 'false'},
    )
    assert response.json()['auto_insert_status'] is None  # explicit param wins over the stored default


@pytest.mark.asyncio
async def test_extract_auto_insert_cache_hit_still_runs_auto_insert_fresh(client, make_user):
    """The exact regression this feature's own plan flagged: a cached
    result's auto_insert_status is always None (caching happens before
    auto-insert ever runs) — a naive `if cached: return cached` would
    silently skip auto-insert entirely on a repeat call. Both calls here
    must show auto_insert_status *attempted* (non-None), proving the
    second (cache-hit) call re-ran the auto-insert step rather than
    returning the raw cached blob as-is."""

    _, token = await make_user()
    headers = {'Authorization': f'Bearer {token}'}

    first = await client.post(
        '/api/v1/movie-metadata/extract', headers=headers,
        files={'ticket_image': ('ticket-1.png', real_ticket_image_bytes(), 'image/png')},
        data={'auto_insert': 'true'},
    )
    assert first.status_code == 200
    assert first.json()['auto_insert_status'] == 'inserted'

    second = await client.post(
        '/api/v1/movie-metadata/extract', headers=headers,
        files={'ticket_image': ('ticket-1.png', real_ticket_image_bytes(), 'image/png')},
        data={'auto_insert': 'true'},
    )
    assert second.status_code == 200
    assert second.json()['auto_insert_status'] == 'inserted'
    # Two real, distinct logs — not one insert echoed back twice.
    assert second.json()['movie_log_id'] != first.json()['movie_log_id']
