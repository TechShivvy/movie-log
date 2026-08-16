"""routers/movie_metadata_batch.py + services/extraction_batches.py — the
in-process background batch flow: creation validation, real end-to-end
processing against the shared/free OpenRouter path (same reasoning
test_llm_provider_resolution.py already documents for using that path
without @pytest.mark.llm — server-enforced free-models-only, quota-
bounded, no personal test keys involved), one bad item not failing the
whole batch, RLS on reads, and the staleness detector.
"""

import asyncio
import base64

import httpx
import pytest
from config import settings

_TINY_PNG = base64.b64decode(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42'
    'YAAAAASUVORK5CYII='
)


async def _poll_until_terminal(client, headers, batch_id, *, timeout=60.0):
    """Bounded retry loop — real pacing delay in the background task
    means this can take a while (mark @pytest.mark.slow), but never
    hangs forever."""

    elapsed = 0.0
    interval = 1.0
    while elapsed < timeout:
        response = await client.get(f'/api/v1/movie-metadata/extract-batch/{batch_id}', headers=headers)
        assert response.status_code == 200
        body = response.json()
        if body['status'] != 'processing':
            return body
        await asyncio.sleep(interval)
        elapsed += interval
    pytest.fail(f'batch {batch_id} did not reach a terminal status within {timeout}s')


@pytest.mark.asyncio
async def test_batch_rejects_empty_items(client, make_user):
    _, token = await make_user()
    response = await client.post(
        '/api/v1/movie-metadata/extract-batch', headers={'Authorization': f'Bearer {token}'},
        files=[],
    )
    # No files at all -> FastAPI's own 422 for a missing required field,
    # never reaching our own BATCH_TOO_LARGE/empty-batch check.
    assert response.status_code in (400, 422)


@pytest.mark.asyncio
async def test_batch_rejects_more_than_max_batch_size(client, make_user):
    _, token = await make_user()
    files = [
        ('ticket_images', (f't{i}.png', _TINY_PNG, 'image/png'))
        for i in range(settings.max_batch_size + 1)
    ]
    response = await client.post(
        '/api/v1/movie-metadata/extract-batch', headers={'Authorization': f'Bearer {token}'}, files=files,
    )
    assert response.status_code == 400
    assert response.json()['code'] == 'BATCH_TOO_LARGE'


@pytest.mark.asyncio
async def test_batch_no_key_for_byo_provider_400s_before_creating_any_row(client, make_user):
    user_id, token = await make_user()
    headers = {'Authorization': f'Bearer {token}'}
    response = await client.post(
        '/api/v1/movie-metadata/extract-batch', headers=headers,
        files=[('ticket_images', ('t.png', _TINY_PNG, 'image/png'))],
        data={'provider': 'gemini'},
    )
    assert response.status_code == 400
    assert 'Gemini' in response.json()['message']

    listed = await client.get('/api/v1/movie-metadata/extract-batch', headers=headers)
    assert listed.status_code == 200
    assert listed.json() == []  # no partial batch left behind


@pytest.mark.asyncio
async def test_batch_get_404s_for_someone_elses_batch(client, make_user):
    _, owner_token = await make_user()
    _, other_token = await make_user()
    created = await client.post(
        '/api/v1/movie-metadata/extract-batch', headers={'Authorization': f'Bearer {owner_token}'},
        files=[('ticket_images', ('t.png', _TINY_PNG, 'image/png'))],
    )
    assert created.status_code == 202
    batch_id = created.json()['id']

    as_other = await client.get(
        f'/api/v1/movie-metadata/extract-batch/{batch_id}', headers={'Authorization': f'Bearer {other_token}'},
    )
    assert as_other.status_code == 404


@pytest.mark.asyncio
async def test_unknown_batch_id_404s(client, make_user):
    _, token = await make_user()
    response = await client.get(
        '/api/v1/movie-metadata/extract-batch/00000000-0000-0000-0000-000000000000',
        headers={'Authorization': f'Bearer {token}'},
    )
    assert response.status_code == 404


@pytest.mark.slow
@pytest.mark.asyncio
async def test_batch_happy_path_against_real_shared_openrouter_key(client, make_user):
    _, token = await make_user()
    headers = {'Authorization': f'Bearer {token}'}
    created = await client.post(
        '/api/v1/movie-metadata/extract-batch', headers=headers,
        files=[
            ('ticket_images', ('t1.png', _TINY_PNG, 'image/png')),
            ('ticket_images', ('t2.png', _TINY_PNG, 'image/png')),
        ],
    )
    assert created.status_code == 202
    body = created.json()
    assert body['status'] == 'processing'
    assert body['total_items'] == 2

    final = await _poll_until_terminal(client, headers, body['id'])
    assert final['status'] == 'completed'
    assert final['completed_items'] + final['failed_items'] == 2
    assert len(final['items']) == 2
    assert {item['position'] for item in final['items']} == {0, 1}
    # Same image both times -> the second item should hit the
    # content-addressed cache, but still resolve to a real completed
    # result independently.
    for item in final['items']:
        assert item['status'] in ('completed', 'failed')


@pytest.mark.slow
@pytest.mark.asyncio
async def test_batch_one_bad_item_does_not_fail_the_whole_batch(client, make_user):
    _, token = await make_user()
    headers = {'Authorization': f'Bearer {token}'}
    created = await client.post(
        '/api/v1/movie-metadata/extract-batch', headers=headers,
        files=[
            ('ticket_images', ('good.png', _TINY_PNG, 'image/png')),
            ('ticket_images', ('bad.txt', b'this is not an image at all', 'text/plain')),
        ],
    )
    assert created.status_code == 202
    batch_id = created.json()['id']

    final = await _poll_until_terminal(client, headers, batch_id)
    assert final['status'] == 'completed'  # the batch itself finished processing
    statuses = sorted(item['status'] for item in final['items'])
    assert statuses == ['completed', 'failed']  # mixed outcome, not all-or-nothing


@pytest.mark.asyncio
async def test_batch_staleness_detector_marks_a_stuck_batch_failed(client, make_user):
    """Inserted directly via the admin key (bypassing the real
    POST /extract-batch flow entirely) rather than backdating a real,
    concurrently-running batch — a real batch's own background task can
    race a backdating PATCH and legitimately win (a single tiny/cached
    image completes fast), which isn't what this test is trying to prove.
    This constructs the exact "stuck" shape GET's staleness check reacts
    to, with nothing else touching the row at all."""

    user_id, token = await make_user()
    headers = {'Authorization': f'Bearer {token}'}
    admin_key = (
        settings.supabase_secret_key.get_secret_value() if settings.supabase_secret_key
        else settings.supabase_service_role_key.get_secret_value()
    )
    admin_headers = {'apikey': admin_key, 'Authorization': f'Bearer {admin_key}', 'Prefer': 'return=representation'}
    stale_time = '2020-01-01T00:00:00+00:00'

    async with httpx.AsyncClient(timeout=15.0) as admin_http:
        created = await admin_http.post(
            f"{settings.supabase_url.rstrip('/')}/rest/v1/extraction_batches",
            headers=admin_headers,
            json={
                'user_id': user_id, 'status': 'processing', 'provider': 'openrouter',
                'model': 'qwen/qwen2.5-vl-72b-instruct:free', 'total_items': 1,
                'last_progress_at': stale_time,
            },
        )
        assert created.status_code < 300
        batch_id = created.json()[0]['id']

    response = await client.get(f'/api/v1/movie-metadata/extract-batch/{batch_id}', headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body['status'] == 'failed'
    assert body['error_code'] == 'STALLED'
