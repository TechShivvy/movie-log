"""routers/reports.py — create + admin triage, the flat ADMIN_USER_IDS
allowlist gate, and the "a private log 404s exactly like a nonexistent
one, so reporting can't be used to probe existence" rule from Iteration 1.
"""

import pytest


@pytest.mark.asyncio
async def test_reporting_a_public_log_succeeds(client, make_user):
    owner_id, owner_token = await make_user()
    reporter_id, reporter_token = await make_user()
    log = await client.post(
        '/api/v1/movie-logs', headers={'Authorization': f'Bearer {owner_token}'},
        json={'movie': 'Report Test', 'visibility': 'public'},
    )
    report = await client.post(
        '/api/v1/reports', headers={'Authorization': f'Bearer {reporter_token}'},
        json={'target_type': 'movie_log', 'target_id': log.json()['id'], 'reason': 'Spam content'},
    )
    assert report.status_code == 201
    assert report.json()['status'] == 'open'


@pytest.mark.asyncio
async def test_reporting_a_private_log_404s_same_as_nonexistent(client, make_user):
    """Can't be used to probe for a private log's existence — a private
    log and a made-up id must produce the identical response."""

    owner_id, owner_token = await make_user()
    reporter_id, reporter_token = await make_user()
    reporter_headers = {'Authorization': f'Bearer {reporter_token}'}
    log = await client.post(
        '/api/v1/movie-logs', headers={'Authorization': f'Bearer {owner_token}'},
        json={'movie': 'Private Report Test', 'visibility': 'private'},
    )

    real_private = await client.post(
        '/api/v1/reports', headers=reporter_headers,
        json={'target_type': 'movie_log', 'target_id': log.json()['id'], 'reason': 'x'},
    )
    made_up = await client.post(
        '/api/v1/reports', headers=reporter_headers,
        json={'target_type': 'movie_log', 'target_id': '00000000-0000-0000-0000-000000000000', 'reason': 'x'},
    )
    assert real_private.status_code == made_up.status_code == 404


@pytest.mark.asyncio
async def test_admin_triage_403s_a_non_admin_even_authenticated(client, make_user):
    _, token = await make_user()
    response = await client.get('/api/v1/reports/admin', headers={'Authorization': f'Bearer {token}'})
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_admin_can_triage_and_remove_reported_content(client, make_user, admin_user):
    owner_id, owner_token = await make_user()
    reporter_id, reporter_token = await make_user()
    admin_id, admin_token = admin_user
    admin_headers = {'Authorization': f'Bearer {admin_token}'}

    log = await client.post(
        '/api/v1/movie-logs', headers={'Authorization': f'Bearer {owner_token}'},
        json={'movie': 'Admin Triage Test', 'visibility': 'public'},
    )
    log_id = log.json()['id']
    report = await client.post(
        '/api/v1/reports', headers={'Authorization': f'Bearer {reporter_token}'},
        json={'target_type': 'movie_log', 'target_id': log_id, 'reason': 'Bad content'},
    )
    report_id = report.json()['id']

    listed = await client.get('/api/v1/reports/admin', headers=admin_headers)
    assert listed.status_code == 200
    assert report_id in [r['id'] for r in listed.json()]

    triaged = await client.patch(
        f'/api/v1/reports/admin/{report_id}', headers=admin_headers,
        json={'status': 'reviewed', 'remove_content': True},
    )
    assert triaged.status_code == 200
    assert triaged.json()['status'] == 'reviewed'

    # The reported log is actually gone.
    gone = await client.get(
        f'/api/v1/movie-logs/{log_id}', headers={'Authorization': f'Bearer {owner_token}'},
    )
    assert gone.status_code == 404


@pytest.mark.asyncio
async def test_unknown_report_id_404s(client, admin_user):
    _, admin_token = admin_user
    response = await client.patch(
        '/api/v1/reports/admin/00000000-0000-0000-0000-000000000000',
        headers={'Authorization': f'Bearer {admin_token}'}, json={'status': 'dismissed'},
    )
    assert response.status_code == 404
