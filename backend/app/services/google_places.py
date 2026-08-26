"""Google Places API (New) client — theatre search/details.

Makes theatre creation authoritative instead of free-typed (see
routers/venues.py): search-as-you-type suggestions restricted to real
cinemas, then a place_id resolved server-side into name/address/lat-lng
that the client can't spoof or mistype. Optional end-to-end — every
function here only runs when settings.google_places_api_key is configured;
callers fall back to free-typed data (theatres.source='user_submitted')
when it isn't, same shape as OpenRouter's shared-key-optional pattern in
routers/movie_metadata.py.
"""

from typing import Any, Optional

import httpx
from config import settings
from loguru_setup import LOGGER
from utils.errors import APIError

_BASE = 'https://places.googleapis.com/v1'
_TIMEOUT = 10.0

# Priority order for picking a "city" out of Google's address_components —
# `locality` covers most cases, but some places (small towns, some Indian
# municipal areas) only carry one of the others. First match wins.
_CITY_TYPES = ('locality', 'postal_town', 'sublocality_level_1', 'administrative_area_level_2')


def is_configured() -> bool:
    return bool(settings.google_places_api_key)


def _api_key() -> str:
    if not settings.google_places_api_key:
        raise APIError(
            500, 'CONFIG_ERROR', 'Google Places API key is not configured on the backend.'
        )
    return settings.google_places_api_key.get_secret_value()


async def autocomplete(
    query: str, *, session_token: Optional[str] = None, region_code: Optional[str] = None
) -> list[dict[str, Any]]:
    """Search-as-you-type suggestions, restricted to movie theatres.

    session_token: pass the same client-generated token across every
    keystroke of one search *and* the place_details() call that follows it
    — Google bills a whole autocomplete-then-details session as one unit
    when the token matches, instead of every request separately. Omitting
    it still works, just costs more per search.
    """

    body: dict[str, Any] = {'input': query, 'includedPrimaryTypes': ['movie_theater']}
    if session_token:
        body['sessionToken'] = session_token
    if region_code:
        body['regionCode'] = region_code

    headers = {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': _api_key(),
        'X-Goog-FieldMask': 'suggestions.placePrediction.placeId,'
        'suggestions.placePrediction.text.text,'
        'suggestions.placePrediction.structuredFormat',
    }
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            response = await client.post(
                f'{_BASE}/places:autocomplete', headers=headers, json=body
            )
    except httpx.HTTPError as exc:
        LOGGER.error('Places autocomplete transport error: {}', exc)
        raise APIError(502, 'UPSTREAM_ERROR', 'Google Places is unavailable.') from exc

    if response.status_code != 200:
        LOGGER.error(
            'Places autocomplete failed status={} body={}',
            response.status_code,
            response.text[:500],
        )
        raise APIError(502, 'UPSTREAM_ERROR', 'Google Places request failed.')

    suggestions = []
    for item in response.json().get('suggestions', []):
        pred = item.get('placePrediction')
        if not pred:
            continue
        structured = pred.get('structuredFormat') or {}
        suggestions.append(
            {
                'place_id': pred.get('placeId'),
                'description': (pred.get('text') or {}).get('text'),
                'main_text': (structured.get('mainText') or {}).get('text'),
                'secondary_text': (structured.get('secondaryText') or {}).get('text'),
            }
        )
    return suggestions


async def place_details(place_id: str) -> dict[str, Any]:
    """Authoritative theatre fields for a place_id the caller chose from
    autocomplete() — shaped to drop straight into TheatreCreate."""

    headers = {
        'X-Goog-Api-Key': _api_key(),
        'X-Goog-FieldMask': 'id,displayName,formattedAddress,location,addressComponents',
    }
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            response = await client.get(f'{_BASE}/places/{place_id}', headers=headers)
    except httpx.HTTPError as exc:
        LOGGER.error('Places details transport error: {}', exc)
        raise APIError(502, 'UPSTREAM_ERROR', 'Google Places is unavailable.') from exc

    if response.status_code == 404:
        raise APIError(404, 'NOT_FOUND', 'No Google Places result for this place_id.')
    if response.status_code != 200:
        LOGGER.error(
            'Places details failed status={} body={}', response.status_code, response.text[:500]
        )
        raise APIError(502, 'UPSTREAM_ERROR', 'Google Places request failed.')

    data = response.json()
    components = data.get('addressComponents', [])

    city = None
    for want in _CITY_TYPES:
        match = next((c for c in components if want in c.get('types', [])), None)
        if match:
            city = match.get('longText')
            break

    state_match = next(
        (c for c in components if 'administrative_area_level_1' in c.get('types', [])), None
    )
    country_match = next((c for c in components if 'country' in c.get('types', [])), None)

    location = data.get('location') or {}
    return {
        'name': (data.get('displayName') or {}).get('text'),
        'city': city,
        'state': state_match.get('longText') if state_match else None,
        # shortText for country -> the ISO-2 code, matching theatres.country's
        # existing shape ('IN'), not the full country name.
        'country': (country_match.get('shortText') if country_match else None) or 'IN',
        'lat': location.get('latitude'),
        'lng': location.get('longitude'),
        'place_id': data.get('id', place_id),
        'formatted_address': data.get('formattedAddress'),
    }
