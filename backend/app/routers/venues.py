"""Theatre/screen directory: public read, authenticated create.

Creation flow: client runs /theatres/match against OCR'd text for a
"did you mean" prompt, then either picks an existing theatre or creates
a new one via Google Places (place_id is the real dedup key — name
similarity is only ever used for the prompt, never for auto-merging).
"""

from typing import Annotated, Any, List, Optional

from auth.supabase_auth import (
    AuthenticatedUser,
    get_current_admin,
    get_current_user,
    get_current_user_optional,
)
from config import settings
from fastapi import APIRouter, Depends, Query, Request
from rate_limit import limiter
from responses.venues import responses
from schemas.venues import (
    PunctualityStats,
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
    VenueNicknameUpdate,
    VenueNote,
    VenueNoteInput,
    VenueStatusUpdate,
)
from services import google_places, supabase_admin, supabase_rest, venue_resolution
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
    'to the request body as-is (`source=\'user_submitted\'`) if place_id is '
    'omitted, no Places API key is configured, or the Places lookup itself fails '
    'for any reason (billing/quota/outage, or a place_id that no longer '
    "resolves) — a Places hiccup never blocks theatre creation, it only means "
    "the theatre lands unverified instead of Google-verified.",
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
    # The create-or-reuse-by-place_id logic (place_id dedup, Places lookup,
    # non-fatal fallback) lives in services/venue_resolution.py — shared
    # with the movie-log write path's theatre_place resolution
    # (routers/movie_logs.py). This call is behaviorally identical to the
    # inline version this endpoint used before that extraction.
    return await venue_resolution.resolve_or_create_theatre(
        current_user.access_token, current_user.user_id, payload.model_dump()
    )


@router.get(
    '/theatres/{theatre_id}',
    response_model=Theatre,
    tags=['Venues'],
    description='A single theatre by id — the full directory row, including '
    '`nickname`/`nickname_address` if an admin has set one. Public — no sign-in '
    'needed, same `theatres_select_all` RLS (`using(true)`) every other public '
    'venues endpoint already reads through.',
    response_description='The theatre.',
    responses=responses['get_theatre'],
    operation_id='GetTheatre',
)
@limiter.limit(_DEFAULT_LIMIT)
async def get_theatre(request: Request, theatre_id: str) -> Any:
    theatre = await supabase_rest.get_theatre(theatre_id)
    if theatre is None:
        raise APIError(404, 'NOT_FOUND', 'Theatre not found.')
    return theatre


@router.patch(
    '/theatres/{theatre_id}/nickname',
    response_model=Theatre,
    tags=['Venues'],
    description='Admin-only: set the theatre\'s optional alternate label '
    '(`nickname`) and/or alternate address (`nickname_address`) — NOT a '
    'correction to the Google-sourced `name`/`formatted_address` (those stay '
    "untouched); this is a separate, additional label the frontend shows only "
    'when present. Same admin-only reasoning as PATCH /theatres/{id}/status — '
    'shared directory data, a false label misleads everyone who sees this '
    'theatre afterward. Both fields are optional and independently settable: '
    'omitted entirely leaves the field unchanged, `null`/`""` clears it, a '
    'non-empty string sets it. At least one of the two must be present.',
    response_description='The updated theatre.',
    responses=responses['set_theatre_nickname'],
    operation_id='SetTheatreNickname',
)
@limiter.limit(_DEFAULT_LIMIT)
async def set_theatre_nickname(
    request: Request,
    theatre_id: str,
    payload: VenueNicknameUpdate,
    admin: AuthenticatedUser = Depends(get_current_admin),
) -> Any:
    patch = payload.model_dump(exclude_unset=True)
    if not patch:
        raise APIError(400, 'BAD_REQUEST', 'No fields provided to update.')
    # exclude_unset tells us which fields were actually sent; within those,
    # null/blank clears the column (None), anything else sets it as given
    # (trimmed) — see VenueNicknameUpdate's own docstring for this contract.
    row = {k: (v.strip() or None) if isinstance(v, str) else v for k, v in patch.items()}
    updated = await supabase_admin.update_theatre_nickname(theatre_id, row)
    if updated is None:
        raise APIError(404, 'NOT_FOUND', 'Theatre not found.')
    return updated


@router.patch(
    '/theatres/{theatre_id}/status',
    response_model=Theatre,
    tags=['Venues'],
    description='Admin-only: mark a theatre open/closed/renovation. This is '
    'shared directory data referenced by many users\' history — a false claim '
    'here misleads everyone who sees this theatre afterward, same reasoning '
    'that\'s kept theatre editing out of scope generally — so this needs the '
    'same allowlist gate (ADMIN_USER_IDS) report triage already uses, not a '
    'crowd-sourced write. Never hides the theatre from search/match/history, '
    'purely an annotation for the frontend to badge.',
    response_description='The updated theatre.',
    responses=responses['set_theatre_status'],
    operation_id='SetTheatreStatus',
)
@limiter.limit(_DEFAULT_LIMIT)
async def set_theatre_status(
    request: Request,
    theatre_id: str,
    payload: VenueStatusUpdate,
    admin: AuthenticatedUser = Depends(get_current_admin),
) -> Any:
    updated = await supabase_admin.update_theatre_status(theatre_id, payload.status)
    if updated is None:
        raise APIError(404, 'NOT_FOUND', 'Theatre not found.')
    return updated


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


@router.patch(
    '/screens/{screen_id}/status',
    response_model=Screen,
    tags=['Venues'],
    description='Admin-only: mark a screen open/closed/renovation. Same '
    'shape and same admin-only reasoning as PATCH /theatres/{id}/status.',
    response_description='The updated screen.',
    responses=responses['set_screen_status'],
    operation_id='SetScreenStatus',
)
@limiter.limit(_DEFAULT_LIMIT)
async def set_screen_status(
    request: Request,
    screen_id: str,
    payload: VenueStatusUpdate,
    admin: AuthenticatedUser = Depends(get_current_admin),
) -> Any:
    updated = await supabase_admin.update_screen_status(screen_id, payload.status)
    if updated is None:
        raise APIError(404, 'NOT_FOUND', 'Screen not found.')
    return updated


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
    description='Aggregate ratings across every screen at this theatre, plus '
    '`punctuality` — screening on-time/early/delayed/cancelled counts and average '
    'delay, rolled up the same way (regardless of a log\'s visibility, it\'s venue '
    'signal not review content). The two are fetched and merged independently, not '
    'one SQL join — a theatre can have one without the other (nobody\'s rated the '
    "venue itself yet, but people have logged cancellations, or vice versa), so "
    'this only 404s if *both* are completely empty. Public — no sign-in needed, '
    'unlike every other endpoint in this API.',
    response_description='Aggregate rating and punctuality stats for the theatre.',
    responses=responses['theatre_stats'],
    operation_id='GetTheatreStats',
)
@limiter.limit(_DEFAULT_LIMIT)
async def theatre_stats(request: Request, theatre_id: str) -> Any:
    stats = await supabase_rest.get_theatre_stats(theatre_id)
    punctuality = await supabase_rest.get_theatre_punctuality_stats(theatre_id)
    if stats is None and punctuality is None:
        # Same for an unknown theatre_id and a real one with no stats yet —
        # distinguishing the two would need an extra existence check for
        # marginal benefit. Was previously returning `null` with a 200 here,
        # which is surprising for clients to handle correctly; a real error
        # code matches every other "not found" case in this API.
        raise APIError(404, 'NOT_FOUND', 'No stats for this theatre yet.')
    empty_rating_stats = {
        'theatre_id': theatre_id, 'overall': {}, 'computed_at': None,
        'overall_avg': None, 'screens_avg': None,
    }
    return {
        **(stats or empty_rating_stats),
        'punctuality': punctuality or PunctualityStats().model_dump(),
    }


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
    current_user: Optional[AuthenticatedUser] = Depends(get_current_user_optional),
) -> Any:
    viewer_token = current_user.access_token if current_user else None
    return await supabase_rest.list_theatre_reviews(
        theatre_id, limit=limit, offset=offset, viewer_token=viewer_token
    )


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
    description='Aggregate ratings for a single screen, plus `punctuality` — same '
    'shape and same independent-fetch-and-merge reasoning as '
    'GET /theatres/{id}/stats. Public — no sign-in needed.',
    response_description='Aggregate rating and punctuality stats for the screen.',
    responses=responses['screen_stats'],
    operation_id='GetScreenStats',
)
@limiter.limit(_DEFAULT_LIMIT)
async def screen_stats(request: Request, screen_id: str) -> Any:
    stats = await supabase_rest.get_screen_stats(screen_id)
    punctuality = await supabase_rest.get_screen_punctuality_stats(screen_id)
    if stats is None and punctuality is None:
        raise APIError(404, 'NOT_FOUND', 'No stats for this screen yet.')
    empty_rating_stats = {
        'screen_id': screen_id, 'categories': {}, 'computed_at': None, 'overall_avg': None,
    }
    return {
        **(stats or empty_rating_stats),
        'punctuality': punctuality or PunctualityStats().model_dump(),
    }


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
    current_user: Optional[AuthenticatedUser] = Depends(get_current_user_optional),
) -> Any:
    viewer_token = current_user.access_token if current_user else None
    return await supabase_rest.list_screen_reviews(
        screen_id, limit=limit, offset=offset, viewer_token=viewer_token
    )


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
