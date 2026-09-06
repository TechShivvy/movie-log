from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class MovieSearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=300)

    model_config = ConfigDict(json_schema_extra={'example': {'query': 'Kalki 2898'}})


class MovieSearchResult(BaseModel):
    tmdb_id: int
    title: str
    original_language: Optional[str] = None
    release_date: Optional[str] = None
    poster_path: Optional[str] = Field(
        default=None,
        description='TMDB poster path, e.g. "/abc123.jpg" — one value, no '
        'separate small/large fields; the client builds the actual image URL '
        'by prepending https://image.tmdb.org/t/p/{size} plus this path, '
        'picking {size} per context (a fixed, stable TMDB size list, not '
        'something this backend needs to proxy): w92/w154 for a small '
        'thumbnail (e.g. a search-suggestions dropdown row), w500/w780 for a '
        'large one (e.g. a movie detail page or search results grid), '
        '"original" for full resolution. Same "we store the path, client '
        'builds the URL" shape as avatar_path.',
    )


class MovieCreate(BaseModel):
    tmdb_id: int = Field(..., description='A tmdb_id from POST /movies/search.')

    model_config = ConfigDict(json_schema_extra={'example': {'tmdb_id': 698687}})


class Movie(MovieSearchResult):
    id: str

    model_config = ConfigDict(extra='ignore')


class MovieStats(BaseModel):
    movie_id: str
    avg_rating: Optional[float] = None
    rating_count: int = 0

    model_config = ConfigDict(
        json_schema_extra={
            'example': {
                'movie_id': '88888888-8888-8888-8888-888888888888',
                'avg_rating': 4.2,
                'rating_count': 17,
            }
        }
    )
