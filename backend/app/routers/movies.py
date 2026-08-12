"""Optional movie catalog, backed by TMDB: search-as-you-type over TMDB's
full catalog, "create" that dedupes by tmdb_id into our own movies table
(same shape as theatres/place_id), and a thin upcoming-releases proxy.
Every route here 500s CONFIG_ERROR if the backend has no TMDB API key
configured — that's a valid, supported state (a movie log still works with
just a free-typed title), not a bug to work around client-side.
"""

from typing import Any, List, Optional

from auth.supabase_auth import AuthenticatedUser, get_current_user
from config import settings
from fastapi import APIRouter, Depends, Query, Request
from loguru_setup import LOGGER
from rate_limit import limiter
from responses.movies import responses
from schemas.movies import Movie, MovieCreate, MovieSearchRequest, MovieSearchResult
from services import supabase_rest, tmdb

router = APIRouter()

_DEFAULT_LIMIT = f'{settings.default_rate_limit_per_minute}/minute'
# Tighter than _DEFAULT_LIMIT deliberately, same reasoning as
# venues.py's _PLACES_SEARCH_LIMIT: this calls a billed/rate-limited
# third-party API, not our own database.
_TMDB_SEARCH_LIMIT = '20/minute'


@router.post(
    '/search',
    response_model=List[MovieSearchResult],
    tags=['Movies'],
    description='Search-as-you-type over TMDB\'s full catalog. Returns 500 '
    'CONFIG_ERROR if the backend has no TMDB API key configured.',
    response_description='Matching movies from TMDB, most relevant first.',
    responses=responses['search_movies'],
    operation_id='SearchMovies',
)
@limiter.limit(_TMDB_SEARCH_LIMIT)
async def search_movies(
    request: Request,
    payload: MovieSearchRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Any:
    return await tmdb.search_movies(payload.query)


@router.post(
    '',
    response_model=Movie,
    status_code=201,
    tags=['Movies'],
    description='Create a catalog entry from a tmdb_id picked out of POST '
    '/movies/search, or return the existing one if this tmdb_id is already '
    'on file. Use the returned `id` as `movie_id` on POST /movie-logs — the '
    "free-typed `movie` text field stays the display source of truth either "
    'way, this only links the log to the catalog.',
    response_description='The created (or matched existing) catalog entry.',
    responses=responses['create_movie'],
    operation_id='CreateMovie',
)
@limiter.limit(_DEFAULT_LIMIT)
async def create_movie(
    request: Request,
    payload: MovieCreate,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Any:
    # tmdb_id is the durable dedup key: if a catalog entry already exists,
    # return it instead of creating a duplicate row.
    existing = await supabase_rest.find_movie_by_tmdb_id(
        current_user.access_token, payload.tmdb_id
    )
    if existing:
        LOGGER.debug('create_movie: reusing existing tmdb_id={}', payload.tmdb_id)
        return existing

    details = await tmdb.movie_details(payload.tmdb_id)
    return await supabase_rest.create_movie(current_user.access_token, details)


@router.get(
    '/upcoming',
    response_model=List[MovieSearchResult],
    tags=['Movies'],
    description='Thin proxy to TMDB\'s upcoming-releases list — not cached '
    'locally, freshness matters more than dedup here. Returns 500 '
    'CONFIG_ERROR if the backend has no TMDB API key configured.',
    response_description='Upcoming releases from TMDB.',
    responses=responses['upcoming_movies'],
    operation_id='ListUpcomingMovies',
)
@limiter.limit(_DEFAULT_LIMIT)
async def upcoming_movies(
    request: Request,
    region: Optional[str] = Query(default=None, max_length=2),
    language: Optional[str] = Query(default=None, max_length=10),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Any:
    return await tmdb.upcoming_movies(region=region, language=language)
