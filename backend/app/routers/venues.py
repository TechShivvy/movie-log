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
from schemas.venues import (
    Screen,
    ScreenCreate,
    Theatre,
    TheatreCreate,
    TheatreMatchCandidate,
    TheatreMatchRequest,
)
from services import supabase_rest

router = APIRouter()


@router.post(
    '/theatres/match', response_model=List[TheatreMatchCandidate], tags=['Venues']
)
async def match_theatres(
    payload: TheatreMatchRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Any:
    return await supabase_rest.match_theatres(
        current_user.access_token, query=payload.query, city=payload.city
    )


@router.post('/theatres', response_model=Theatre, status_code=201, tags=['Venues'])
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
    '/theatres/{theatre_id}/screens', response_model=List[Screen], tags=['Venues']
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


@router.get('/theatres/{theatre_id}/stats', tags=['Venues'])
async def theatre_stats(theatre_id: str) -> Any:
    return await supabase_rest.get_theatre_stats(theatre_id)


@router.get('/screens/{screen_id}/stats', tags=['Venues'])
async def screen_stats(screen_id: str) -> Any:
    return await supabase_rest.get_screen_stats(screen_id)
