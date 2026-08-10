"""Theatre/screen directory: public read, authenticated create.

Creation flow: client runs /theatres/match against OCR'd text for a
"did you mean" prompt, then either picks an existing theatre or creates
a new one via Google Places (place_id is the real dedup key — name
similarity is only ever used for the prompt, never for auto-merging).
"""

from typing import Annotated, Any, List

from auth.supabase_auth import AuthenticatedUser, get_current_user
from config import settings
from fastapi import APIRouter, Depends, Query, Request
from loguru_setup import LOGGER
from rate_limit import limiter
from responses.venues import responses
from schemas.venue_notes import VenueNote, VenueNoteInput
from schemas.venues import (
    Screen,
    ScreenCreate,
    ScreenMatchCandidate,
    ScreenMatchRequest,
    Theatre,
    TheatreCreate,
    TheatreMatchCandidate,
    TheatreMatchRequest,
    TheatrePlaceSuggestion,
    TheatreSearchRequest,
)
from services import google_places, supabase_rest
from utils.errors import APIError

router = APIRouter()

_DEFAULT_LIMIT = f'{settings.default_rate_limit_per_minute}/minute'
# Tighter than _DEFAULT_LIMIT deliberately: unlike /theatres/match (trigram
# search over our own DB, free), this calls the Google Places API, which is
# billed per request past its monthly credit.
_PLACES_SEARCH_LIMIT = '20/minute'


@router.post(
    '/theatres/match',
    response_model=List[TheatreMatchCandidate],
    tags=['Venues'],
    description='Find existing theatres whose name is similar to the given query '
    '(trigram similarity, optionally scoped to a city) — run this against OCR\'d '
    'ticket text for a "did you mean" prompt before offering to create a new '
    "theatre. Never used for auto-merging; place_id is the only real dedup key.",
    response_description='Candidate theatres, most similar first.',
    responses=responses['match_theatres'],
    operation_id='MatchTheatres',
)
@limiter.limit(_DEFAULT_LIMIT)
async def match_theatres(
    request: Request,
    payload: TheatreMatchRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Any:
    return await supabase_rest.match_theatres(
        current_user.access_token, query=payload.query, city=payload.city
    )


@router.post(
    '/theatres/search-places',
    response_model=List[TheatrePlaceSuggestion],
    tags=['Venues'],
    description='Search-as-you-type over Google Places, restricted to movie '
    'theatres — run this against free-typed input (not OCR text; use '
    '/theatres/match for that, it\'s free) so the user picks a *real* place '
    'instead of typing one from scratch. Returns 500 CONFIG_ERROR if the '
    "backend has no Google Places API key configured — that's a valid, "
    'supported state (see POST /theatres), not a bug to work around client-'
    'side.',
    response_description='Place suggestions from Google, most relevant first.',
    responses=responses['search_places'],
    operation_id='SearchTheatrePlaces',
)
@limiter.limit(_PLACES_SEARCH_LIMIT)
async def search_places(
    request: Request,
    payload: TheatreSearchRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Any:
    return await google_places.autocomplete(
        payload.query, session_token=payload.session_token
    )


@router.post(
    '/theatres',
    response_model=Theatre,
    status_code=201,
    tags=['Venues'],
    description='Create a theatre, or return the existing one if `place_id` already '
    'matches one on file. Typically called after the user picks a result from '
    'POST /theatres/search-places. If `place_id` is given and the backend has a '
    "Google Places API key configured, the theatre's name/address/lat-lng/city/"
    "state/country are fetched server-side from that place_id and *override* "
    "whatever was sent in the request body — a client can't spoof a theatre's "
    'real-world data just by attaching someone else\'s valid place_id. Falls back '
    'to the request body as-is (source=\'user_submitted\') if place_id is omitted, '
    'or if no Places API key is configured on the backend.',
    response_description='The created (or matched existing) theatre.',
    responses=responses['create_theatre'],
    operation_id='CreateTheatre',
)
@limiter.limit(_DEFAULT_LIMIT)
async def create_theatre(
    request: Request,
    payload: TheatreCreate,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Any:
    # place_id is the durable dedup key: if a theatre with this place_id
    # already exists, return it instead of creating a duplicate row.
    if payload.place_id:
        existing = await supabase_rest.find_theatre_by_place_id(
            current_user.access_token, payload.place_id
        )
        if existing:
            LOGGER.debug(
                'create_theatre: reusing existing place_id={}', payload.place_id
            )
            return existing

    row = payload.model_dump()
    if payload.place_id and google_places.is_configured():
        details = await google_places.place_details(payload.place_id)
        # Only overwrite fields Google actually returned a value for — e.g.
        # if address-component parsing can't find a city for this place,
        # keep whatever the client sent rather than nulling out a NOT NULL
        # column.
        row.update({k: v for k, v in details.items() if v is not None})
        row['source'] = 'google_places'
        LOGGER.info(
            'create_theatre: resolved place_id={} via Google Places', payload.place_id
        )
    else:
        row['source'] = 'user_submitted'

    row['created_by'] = current_user.user_id
    return await supabase_rest.create_theatre(current_user.access_token, row)


@router.get(
    '/theatres/{theatre_id}/screens',
    response_model=List[Screen],
    tags=['Venues'],
    description='List every screen recorded for a theatre.',
    response_description='The screens at this theatre.',
    responses=responses['list_screens'],
    operation_id='ListScreens',
)
@limiter.limit(_DEFAULT_LIMIT)
async def list_screens(
    request: Request,
    theatre_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Any:
    return await supabase_rest.list_screens(current_user.access_token, theatre_id)


@router.post(
    '/theatres/{theatre_id}/screens',
    response_model=Screen,
    status_code=201,
    tags=['Venues'],
    description='Add a screen to a theatre. No dedup here (unlike theatres/place_id) '
    'beyond a same-theatre unique constraint on the screen name.',
    response_description='The created screen.',
    responses=responses['create_screen'],
    operation_id='CreateScreen',
)
@limiter.limit(_DEFAULT_LIMIT)
async def create_screen(
    request: Request,
    theatre_id: str,
    payload: ScreenCreate,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Any:
    row = payload.model_dump()
    row['theatre_id'] = theatre_id
    row['created_by'] = current_user.user_id
    return await supabase_rest.create_screen(current_user.access_token, row)


@router.post(
    '/theatres/{theatre_id}/screens/match',
    response_model=List[ScreenMatchCandidate],
    tags=['Venues'],
    description="Find existing screens at this theatre whose name is similar to "
    'the given query (trigram similarity, scoped to this one theatre) — same '
    'idea as POST /theatres/match, one level down: a "did you mean Screen 4?" '
    'prompt before offering to create a new screen, so near-duplicate names '
    "(\"Screen 4\" vs \"Scrn 4\") don't pile up. Never used for auto-merging.",
    response_description='Candidate screens at this theatre, most similar first.',
    responses=responses['match_screens'],
    operation_id='MatchScreens',
)
@limiter.limit(_DEFAULT_LIMIT)
async def match_screens(
    request: Request,
    theatre_id: str,
    payload: ScreenMatchRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Any:
    return await supabase_rest.match_screens(
        current_user.access_token, theatre_id, payload.query
    )


@router.get(
    '/theatres/{theatre_id}/stats',
    tags=['Venues'],
    description='Aggregate ratings across every screen at this theatre. Public — no '
    'sign-in needed, unlike every other endpoint in this API.',
    response_description='Aggregate rating stats for the theatre.',
    responses=responses['theatre_stats'],
    operation_id='GetTheatreStats',
)
@limiter.limit(_DEFAULT_LIMIT)
async def theatre_stats(request: Request, theatre_id: str) -> Any:
    stats = await supabase_rest.get_theatre_stats(theatre_id)
    if stats is None:
        # Same for an unknown theatre_id and a real one with no ratings yet —
        # distinguishing the two would need an extra existence check for
        # marginal benefit. Was previously returning `null` with a 200 here,
        # which is surprising for clients to handle correctly; a real error
        # code matches every other "not found" case in this API.
        raise APIError(404, 'NOT_FOUND', 'No rating stats for this theatre yet.')
    return stats


@router.get(
    '/theatres/{theatre_id}/reviews',
    tags=['Venues'],
    description='Reviews (movie, rating, notes) written about this theatre, newest '
    'first — both `public` ones (attributed, `username` set) and `anonymous` ones '
    '(`user_id`/`username` both null). `private` reviews never appear here. This is '
    'the *only* place an anonymous review is visible — by design it never shows up '
    "on its writer's own public profile (GET /public/users/{username}). Public — no "
    'sign-in needed.',
    response_description='Reviews for this theatre, most recent first.',
    responses=responses['theatre_reviews'],
    operation_id='ListTheatreReviews',
)
@limiter.limit(_DEFAULT_LIMIT)
async def theatre_reviews(
    request: Request,
    theatre_id: str,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> Any:
    return await supabase_rest.list_theatre_reviews(theatre_id, limit=limit, offset=offset)


@router.get(
    '/theatres/{theatre_id}/note',
    response_model=VenueNote,
    tags=['Venues'],
    description="The caller's own private note about this theatre, if any — "
    "independent of any specific log (see PUT /movie-logs/{id} for per-visit "
    'notes). Never shown to anyone else, no visibility tiers.',
    response_description="The caller's note for this theatre.",
    responses=responses['get_theatre_note'],
    operation_id='GetTheatreNote',
)
@limiter.limit(_DEFAULT_LIMIT)
async def get_theatre_note(
    request: Request,
    theatre_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Any:
    note = await supabase_rest.get_venue_note(
        current_user.access_token, current_user.user_id, theatre_id=theatre_id
    )
    if note is None:
        raise APIError(404, 'NOT_FOUND', 'No note for this theatre yet.')
    return note


@router.put(
    '/theatres/{theatre_id}/note',
    response_model=VenueNote,
    tags=['Venues'],
    description="Set (or replace) the caller's private note about this theatre. "
    'One note per theatre — calling this again overwrites the previous text, '
    "it doesn't keep history.",
    response_description='The saved note.',
    responses=responses['set_theatre_note'],
    operation_id='SetTheatreNote',
)
@limiter.limit(_DEFAULT_LIMIT)
async def set_theatre_note(
    request: Request,
    theatre_id: str,
    payload: VenueNoteInput,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Any:
    return await supabase_rest.upsert_venue_note(
        current_user.access_token, current_user.user_id, payload.note, theatre_id=theatre_id
    )


@router.delete(
    '/theatres/{theatre_id}/note',
    status_code=204,
    tags=['Venues'],
    description="Clear the caller's private note about this theatre.",
    responses=responses['delete_theatre_note'],
    operation_id='DeleteTheatreNote',
)
@limiter.limit(_DEFAULT_LIMIT)
async def delete_theatre_note(
    request: Request,
    theatre_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> None:
    deleted = await supabase_rest.delete_venue_note(
        current_user.access_token, current_user.user_id, theatre_id=theatre_id
    )
    if not deleted:
        raise APIError(404, 'NOT_FOUND', 'No note for this theatre yet.')


@router.get(
    '/screens/{screen_id}/stats',
    tags=['Venues'],
    description='Aggregate ratings for a single screen. Public — no sign-in needed.',
    response_description='Aggregate rating stats for the screen.',
    responses=responses['screen_stats'],
    operation_id='GetScreenStats',
)
@limiter.limit(_DEFAULT_LIMIT)
async def screen_stats(request: Request, screen_id: str) -> Any:
    stats = await supabase_rest.get_screen_stats(screen_id)
    if stats is None:
        raise APIError(404, 'NOT_FOUND', 'No rating stats for this screen yet.')
    return stats


@router.get(
    '/screens/{screen_id}/reviews',
    tags=['Venues'],
    description='Reviews (movie, rating, notes) written about this screen, newest '
    'first — both `public` (attributed) and `anonymous` (not attributed) ones. Same '
    'as GET /theatres/{id}/reviews, scoped to one screen. Public — no sign-in needed.',
    response_description='Reviews for this screen, most recent first.',
    responses=responses['screen_reviews'],
    operation_id='ListScreenReviews',
)
@limiter.limit(_DEFAULT_LIMIT)
async def screen_reviews(
    request: Request,
    screen_id: str,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> Any:
    return await supabase_rest.list_screen_reviews(screen_id, limit=limit, offset=offset)


@router.get(
    '/screens/{screen_id}/note',
    response_model=VenueNote,
    tags=['Venues'],
    description="The caller's own private note about this screen, if any. Same idea "
    'as GET /theatres/{id}/note, scoped to one screen — never shown to anyone else.',
    response_description="The caller's note for this screen.",
    responses=responses['get_screen_note'],
    operation_id='GetScreenNote',
)
@limiter.limit(_DEFAULT_LIMIT)
async def get_screen_note(
    request: Request,
    screen_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Any:
    note = await supabase_rest.get_venue_note(
        current_user.access_token, current_user.user_id, screen_id=screen_id
    )
    if note is None:
        raise APIError(404, 'NOT_FOUND', 'No note for this screen yet.')
    return note


@router.put(
    '/screens/{screen_id}/note',
    response_model=VenueNote,
    tags=['Venues'],
    description="Set (or replace) the caller's private note about this screen. One "
    "note per screen — calling this again overwrites the previous text, it doesn't "
    'keep history.',
    response_description='The saved note.',
    responses=responses['set_screen_note'],
    operation_id='SetScreenNote',
)
@limiter.limit(_DEFAULT_LIMIT)
async def set_screen_note(
    request: Request,
    screen_id: str,
    payload: VenueNoteInput,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Any:
    return await supabase_rest.upsert_venue_note(
        current_user.access_token, current_user.user_id, payload.note, screen_id=screen_id
    )


@router.delete(
    '/screens/{screen_id}/note',
    status_code=204,
    tags=['Venues'],
    description="Clear the caller's private note about this screen.",
    responses=responses['delete_screen_note'],
    operation_id='DeleteScreenNote',
)
@limiter.limit(_DEFAULT_LIMIT)
async def delete_screen_note(
    request: Request,
    screen_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> None:
    deleted = await supabase_rest.delete_venue_note(
        current_user.access_token, current_user.user_id, screen_id=screen_id
    )
    if not deleted:
        raise APIError(404, 'NOT_FOUND', 'No note for this screen yet.')
