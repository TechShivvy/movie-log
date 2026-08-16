"""routers/venues.py — theatres/screens create + dedupe fallback, per-
venue notes, lifecycle status (admin-only), and venue notes being
independent of any specific log.
"""

import uuid

import pytest


@pytest.mark.asyncio
async def test_create_theatre_falls_back_to_submitted_data_on_places_failure(client, make_user):
    """Google Places lookup failing (a fake place_id, no billing, etc.)
    must never block theatre creation — falls back to source='user_submitted'."""

    _, token = await make_user()
    response = await client.post(
        '/api/v1/venues/theatres', headers={'Authorization': f'Bearer {token}'},
        json={'name': 'Fallback Test Theatre', 'place_id': f'fake-{uuid.uuid4().hex[:8]}', 'city': 'X', 'country': 'US'},
    )
    assert response.status_code == 201
    assert response.json()['name'] == 'Fallback Test Theatre'


@pytest.mark.asyncio
async def test_venue_note_independent_of_any_log(client, make_user):
    _, token = await make_user()
    headers = {'Authorization': f'Bearer {token}'}
    theatre = await client.post(
        '/api/v1/venues/theatres', headers=headers,
        json={'name': 'Note Test Theatre', 'place_id': f'note-{uuid.uuid4().hex[:8]}', 'city': 'X', 'country': 'US'},
    )
    theatre_id = theatre.json()['id']

    note = await client.put(
        f'/api/v1/venues/theatres/{theatre_id}/note', headers=headers, json={'note': 'Always ask for row H'},
    )
    assert note.status_code == 200
    assert note.json()['note'] == 'Always ask for row H'

    fetched = await client.get(f'/api/v1/venues/theatres/{theatre_id}/note', headers=headers)
    assert fetched.json()['note'] == 'Always ask for row H'

    deleted = await client.delete(f'/api/v1/venues/theatres/{theatre_id}/note', headers=headers)
    assert deleted.status_code == 204


@pytest.mark.asyncio
async def test_theatre_with_no_data_at_all_404s_stats(client, make_user):
    _, token = await make_user()
    theatre = await client.post(
        '/api/v1/venues/theatres', headers={'Authorization': f'Bearer {token}'},
        json={'name': 'Empty Stats Theatre', 'place_id': f'empty-{uuid.uuid4().hex[:8]}', 'city': 'X', 'country': 'US'},
    )
    theatre_id = theatre.json()['id']
    stats = await client.get(f'/api/v1/venues/theatres/{theatre_id}/stats')
    assert stats.status_code == 404


@pytest.mark.asyncio
async def test_venue_status_admin_only_and_never_hides_from_search(client, make_user, admin_user):
    _, non_admin_token = await make_user()
    admin_id, admin_token = admin_user
    theatre = await client.post(
        '/api/v1/venues/theatres', headers={'Authorization': f'Bearer {admin_token}'},
        json={'name': 'Status Test Theatre', 'place_id': f'status-{uuid.uuid4().hex[:8]}', 'city': 'X', 'country': 'US'},
    )
    theatre_id = theatre.json()['id']

    non_admin_attempt = await client.patch(
        f'/api/v1/venues/theatres/{theatre_id}/status', headers={'Authorization': f'Bearer {non_admin_token}'},
        json={'status': 'closed'},
    )
    assert non_admin_attempt.status_code == 403

    admin_update = await client.patch(
        f'/api/v1/venues/theatres/{theatre_id}/status', headers={'Authorization': f'Bearer {admin_token}'},
        json={'status': 'closed'},
    )
    assert admin_update.status_code == 200
    assert admin_update.json()['status'] == 'closed'

    # Still fully matchable/searchable — status never hides a venue.
    match = await client.post(
        '/api/v1/venues/theatres/match', headers={'Authorization': f'Bearer {non_admin_token}'},
        json={'query': 'Status Test Theatre'},
    )
    assert theatre_id in [m['id'] for m in match.json()]
