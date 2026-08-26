"""Optional movie catalog, backed by TMDB: search-as-you-type over TMDB's
full catalog, "create" that dedupes by tmdb_id into our own movies table
(same shape as theatres/place_id), and a thin upcoming-releases proxy.
Every route here 500s CONFIG_ERROR if the backend has no TMDB API key
configured — that's a valid, supported state (a movie log still works with
just a free-typed title), not a bug to work around client-side.
"""

from typing import Annotated, Any, List, Optional

from auth.supabase_auth import AuthenticatedUser, get_current_user, get_current_user_optional
from config import settings
from fastapi import APIRouter, Depends, Query, Request, status
from loguru_setup import LOGGER
from rate_limit import limiter
from responses.movies import responses
from schemas.movies import Movie, MovieCreate, MovieSearchRequest, MovieSearchResult, MovieStats
from schemas.venues import VenueNote, VenueNoteInput
from services import supabase_rest, tmdb
from utils.errors import APIError

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


# ── Movie pages: everyone's logs/reviews tied to one catalog entry ───────
# All three below are public — no sign-in needed, same as the theatre/
# screen equivalents (GET /venues/theatres/{id}/stats, .../reviews) they
# mirror. Registered after /search, '', /upcoming so a literal "upcoming"
# in the path never gets swallowed by the {movie_id} pattern below it.

@router.get(
    '/{movie_id}',
    response_model=Movie,
    tags=['Movies'],
    description='A catalog entry by id — title/language/release date/poster. '
    'Public — no sign-in needed.',
    response_description='The catalog entry.',
    responses=responses['get_movie'],
    operation_id='GetMovie',
)
@limiter.limit(_DEFAULT_LIMIT)
async def get_movie(request: Request, movie_id: str) -> Any:
    movie = await supabase_rest.get_movie(movie_id)
    if not movie:
        raise APIError(status.HTTP_404_NOT_FOUND, 'NOT_FOUND', 'Movie not found.')
    return movie


@router.get(
    '/{movie_id}/stats',
    response_model=MovieStats,
    tags=['Movies'],
    description="This movie's average rating across every "
    "`public`/`anonymous`-visibility log linked to it (`movie_id`), from any "
    "user — `private` logs never count, same visibility rule theatre/screen "
    'stats already apply. `avg_rating: null`/`rating_count: 0` if nobody has '
    'logged it yet with a rating, not a 404 — a movie existing in the '
    'catalog and having any ratings yet are independent facts.',
    response_description="The movie's aggregate rating.",
    responses=responses['get_movie_stats'],
    operation_id='GetMovieStats',
)
@limiter.limit(_DEFAULT_LIMIT)
async def get_movie_stats(request: Request, movie_id: str) -> Any:
    stats = await supabase_rest.get_movie_stats(movie_id)
    return stats or {'movie_id': movie_id, 'avg_rating': None, 'rating_count': 0}


@router.get(
    '/{movie_id}/reviews',
    tags=['Movies'],
    description='Reviews (theatre, rating, notes) written about this movie, '
    'across every user, newest first — both `public` ones (attributed, '
    '`username` set) and `anonymous` ones (`user_id`/`username` both null). '
    '`private` reviews never appear here, same rule theatre/screen reviews '
    'already apply. Public — no sign-in needed.',
    response_description='Reviews for this movie, most recent first.',
    responses=responses['movie_reviews'],
    operation_id='ListMovieReviews',
)
@limiter.limit(_DEFAULT_LIMIT)
async def movie_reviews(
    request: Request,
    movie_id: str,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
    current_user: Optional[AuthenticatedUser] = Depends(get_current_user_optional),
) -> Any:
    viewer_token = current_user.access_token if current_user else None
    return await supabase_rest.list_movie_reviews(
        movie_id, limit=limit, offset=offset, viewer_token=viewer_token
    )


# ── Private per-user notes about a movie ──────────────────────────────────
# Same pattern as GET/PUT/DELETE /venues/theatres/{id}/note and the screen
# equivalent (routers/venues.py) — one evolving note per (movie, user),
# never shown to anyone else, independent of any specific log. NOT the same
# thing as movie_logs.notes, which is a field on one particular log/visit.

@router.get(
    '/{movie_id}/note',
    response_model=VenueNote,
    tags=['Movies'],
    description="The caller's own private note about this movie, if any — "
    'independent of any specific log (see PUT /movie-logs/{id} for per-visit '
    'notes). Never shown to anyone else, no visibility tiers. Same pattern as '
    'GET /venues/theatres/{id}/note.',
    response_description="The caller's note for this movie.",
    responses=responses['get_movie_note'],
    operation_id='GetMovieNote',
)
@limiter.limit(_DEFAULT_LIMIT)
async def get_movie_note(
    request: Request,
    movie_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Any:
    note = await supabase_rest.get_venue_note(
        current_user.access_token, current_user.user_id, movie_id=movie_id
    )
    if note is None:
        raise APIError(status.HTTP_404_NOT_FOUND, 'NOT_FOUND', 'No note for this movie yet.')
    return note


@router.put(
    '/{movie_id}/note',
    response_model=VenueNote,
    tags=['Movies'],
    description="Set (or replace) the caller's private note about this movie. "
    'One note per movie — calling this again overwrites the previous text, it '
    "doesn't keep history. Same pattern as PUT /venues/theatres/{id}/note.",
    response_description='The saved note.',
    responses=responses['set_movie_note'],
    operation_id='SetMovieNote',
)
@limiter.limit(_DEFAULT_LIMIT)
async def set_movie_note(
    request: Request,
    movie_id: str,
    payload: VenueNoteInput,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Any:
    return await supabase_rest.upsert_venue_note(
        current_user.access_token, current_user.user_id, payload.note, movie_id=movie_id
    )


@router.delete(
    '/{movie_id}/note',
    status_code=status.HTTP_204_NO_CONTENT,
    tags=['Movies'],
    description="Clear the caller's private note about this movie.",
    responses=responses['delete_movie_note'],
    operation_id='DeleteMovieNote',
)
@limiter.limit(_DEFAULT_LIMIT)
async def delete_movie_note(
    request: Request,
    movie_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> None:
    deleted = await supabase_rest.delete_venue_note(
        current_user.access_token, current_user.user_id, movie_id=movie_id
    )
    if not deleted:
        raise APIError(status.HTTP_404_NOT_FOUND, 'NOT_FOUND', 'No note for this movie yet.')
