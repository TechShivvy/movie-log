"""Shared create-or-reuse resolution for theatres/screens, used by both
POST /venues/theatres (routers/venues.py, the original, explicit flow)
and the movie-log write path's `theatre_place`/`screen` resolution
(routers/movie_logs.py) — the latter lets a client submit a Places
identity + a free-text screen name inline with a log save, instead of
pre-creating the theatre/screen with two separate calls first.
"""

from typing import Any, Optional

from loguru_setup import LOGGER
from services import google_places, supabase_rest
from utils.errors import APIError


async def resolve_or_create_theatre(
    access_token: str, user_id: str, submitted: dict[str, Any]
) -> dict[str, Any]:
    """place_id is the real dedup key (never name similarity — see
    routers/venues.py's own module docstring): reuses an existing theatre
    with this place_id if one's already on file, else creates one,
    Places-authoritative if `place_id` resolves and Google Places is
    configured, falling back to `submitted` as-is otherwise (never fatal —
    a Places hiccup only means the theatre lands unverified instead of
    Google-verified, same as POST /theatres today).

    `submitted` is used as the base row as-is, so this covers both call
    sites' shapes: POST /theatres passes a full `TheatreCreate.model_dump()`
    (always has `city`, since that field is required there); the
    `theatre_place` flow (MovieLogInput.theatre_place) passes just
    {place_id, name?, formatted_address?} — no `city`, since that's meant
    to come from Places itself. If `city` is still missing after the
    Places attempt (unconfigured, lookup failed, or Places genuinely
    couldn't classify a city for this address), it's defaulted to
    'Unknown' rather than raising: `theatres.city` is NOT NULL, a
    theatre_place-originated save shouldn't be able to fail outright over
    a city Places just didn't return.
    """

    place_id = submitted.get('place_id')
    if place_id:
        existing = await supabase_rest.find_theatre_by_place_id(access_token, place_id)
        if existing:
            LOGGER.debug('resolve_or_create_theatre: reusing existing place_id={}', place_id)
            return existing

    row: dict[str, Any] = dict(submitted)
    row['source'] = 'user_submitted'
    if place_id and google_places.is_configured():
        try:
            details = await google_places.place_details(place_id)
        except APIError as exc:
            LOGGER.warning(
                'resolve_or_create_theatre: Places lookup failed for place_id={} ({}), '
                'falling back to submitted data',
                place_id,
                exc.message,
            )
        else:
            # Only overwrite fields Google actually returned a value for —
            # same reasoning as POST /theatres itself.
            row.update({k: v for k, v in details.items() if v is not None})
            row['source'] = 'google_places'
            LOGGER.info(
                'resolve_or_create_theatre: resolved place_id={} via Google Places', place_id
            )

    if 'city' not in row:
        # Only reachable from the theatre_place flow (no `city` field to
        # begin with) when Places didn't fill it in — see docstring.
        LOGGER.warning(
            'resolve_or_create_theatre: no city available for place_id={}, defaulting to '
            "'Unknown'",
            place_id,
        )
        row['city'] = 'Unknown'

    row['created_by'] = user_id
    return await supabase_rest.create_theatre(access_token, row)


async def resolve_or_create_screen(
    access_token: str, user_id: str, theatre_id: str, name: str, screen_type: Optional[str] = None
) -> dict[str, Any]:
    """screens_theatre_id_name_key (migration 20260710000001) is this
    table's own dedup key — same relationship place_id has to theatres.
    Reuses an existing screen at (theatre_id, name) if one exists, else
    creates it. Unlike POST /theatres/{id}/screens (which just creates and
    lets the unique constraint reject a repeat name as a 400), this needs
    to actually hand back an id either way — the movie-log write path uses
    it, and a 400 there would abort the whole log save over a screen name
    that's simply been used before.
    """

    existing = await supabase_rest.find_screen_by_theatre_and_name(access_token, theatre_id, name)
    if existing:
        LOGGER.debug(
            'resolve_or_create_screen: reusing existing screen theatre_id={} name={}',
            theatre_id,
            name,
        )
        return existing

    row: dict[str, Any] = {'theatre_id': theatre_id, 'name': name, 'created_by': user_id}
    if screen_type:
        row['screen_type'] = screen_type
    try:
        return await supabase_rest.create_screen(access_token, row)
    except APIError as exc:
        if exc.status_code == 400:
            # Race: another request created the same (theatre_id, name)
            # screen between our lookup and this insert — read it back
            # instead of surfacing a spurious conflict to the caller, same
            # "the constraint is the real dedup key, not a client-visible
            # error" posture as POST /theatres's place_id reuse.
            existing = await supabase_rest.find_screen_by_theatre_and_name(
                access_token, theatre_id, name
            )
            if existing:
                return existing
        raise
