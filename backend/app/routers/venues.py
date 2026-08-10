"""Theatre/screen directory: public read, authenticated create.

Creation flow: client runs /theatres/match against OCR'd text for a
"did you mean" prompt, then either picks an existing theatre or creates
a new one via Google Places (place_id is the real dedup key — name
similarity is only ever used for the prompt, never for auto-merging).
"""

from typing import Any, List

from auth.supabase_auth import AuthenticatedUser, get_current_user
from fastapi import APIRouter, Depends
from loguru_setup import LOGGER
from responses.venues import responses
from schemas.venues import (
    Screen,
    ScreenCreate,
    Theatre,
    TheatreCreate,
    TheatreMatchCandidate,
    TheatreMatchRequest,
)
from services import supabase_rest
from utils.errors import APIError

router = APIRouter()


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
async def match_theatres(
    payload: TheatreMatchRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Any:
    return await supabase_rest.match_theatres(
        current_user.access_token, query=payload.query, city=payload.city
    )


@router.post(
    '/theatres',
    response_model=Theatre,
    status_code=201,
    tags=['Venues'],
    description='Create a theatre, or return the existing one if `place_id` already '
    'matches one on file. Typically called after the user picks "none of these" on '
    'the /theatres/match results and selects a place via Google Places.',
    response_description='The created (or matched existing) theatre.',
    responses=responses['create_theatre'],
    operation_id='CreateTheatre',
)
async def create_theatre(
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
async def list_screens(
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
async def create_screen(
    theatre_id: str,
    payload: ScreenCreate,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Any:
    row = payload.model_dump()
    row['theatre_id'] = theatre_id
    row['created_by'] = current_user.user_id
    return await supabase_rest.create_screen(current_user.access_token, row)


@router.get(
    '/theatres/{theatre_id}/stats',
    tags=['Venues'],
    description='Aggregate ratings across every screen at this theatre. Public — no '
    'sign-in needed, unlike every other endpoint in this API.',
    response_description='Aggregate rating stats for the theatre.',
    responses=responses['theatre_stats'],
    operation_id='GetTheatreStats',
)
async def theatre_stats(theatre_id: str) -> Any:
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
    '/screens/{screen_id}/stats',
    tags=['Venues'],
    description='Aggregate ratings for a single screen. Public — no sign-in needed.',
    response_description='Aggregate rating stats for the screen.',
    responses=responses['screen_stats'],
    operation_id='GetScreenStats',
)
async def screen_stats(screen_id: str) -> Any:
    stats = await supabase_rest.get_screen_stats(screen_id)
    if stats is None:
        raise APIError(404, 'NOT_FOUND', 'No rating stats for this screen yet.')
    return stats
