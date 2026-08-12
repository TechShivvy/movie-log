"""Example request/response bodies for routers/movies.py."""

_SEARCH_RESULT_EXAMPLE = {
    'tmdb_id': 698687,
    'title': 'Kalki 2898 AD',
    'original_language': 'te',
    'release_date': '2024-06-27',
    'poster_path': '/kAOOr...example.jpg',
}

_MOVIE_EXAMPLE = {**_SEARCH_RESULT_EXAMPLE, 'id': '88888888-8888-8888-8888-888888888888'}

_UNAUTHORIZED = {
    401: {
        'description': 'Missing or invalid Supabase access token.',
        'content': {
            'application/json': {
                'examples': {
                    'missing': {
                        'summary': 'No token sent',
                        'value': {'code': 'UNAUTHORIZED', 'message': 'Missing bearer token.'},
                    },
                    'expired': {
                        'summary': 'Token invalid or expired',
                        'value': {
                            'code': 'UNAUTHORIZED',
                            'message': 'Invalid or expired access token.',
                        },
                    },
                }
            }
        },
    }
}

_TMDB_NOT_CONFIGURED = {
    500: {
        'description': 'No TMDB API key configured on the backend — a valid, '
        'supported state, not a bug. A movie log still works with a free-typed '
        '`movie` title; only catalog linking (`movie_id`) is unavailable.',
        'content': {
            'application/json': {
                'example': {
                    'code': 'CONFIG_ERROR',
                    'message': 'TMDB API key is not configured on the backend.',
                }
            }
        },
    }
}

_UPSTREAM = {
    502: {
        'description': 'TMDB is unreachable, timed out, or returned a server error.',
        'content': {
            'application/json': {
                'example': {'code': 'UPSTREAM_ERROR', 'message': 'TMDB request failed.'}
            }
        },
    },
}

responses = {
    'search_movies': {
        200: {
            'description': 'Matching movies from TMDB, most relevant first.',
            'content': {'application/json': {'example': [_SEARCH_RESULT_EXAMPLE]}},
        },
        **_UNAUTHORIZED,
        **_TMDB_NOT_CONFIGURED,
        **_UPSTREAM,
    },
    'create_movie': {
        201: {
            'description': 'The created (or matched existing) catalog entry.',
            'content': {'application/json': {'example': _MOVIE_EXAMPLE}},
        },
        404: {
            'description': 'tmdb_id does not resolve on TMDB.',
            'content': {
                'application/json': {
                    'example': {'code': 'NOT_FOUND', 'message': 'No TMDB result for this id.'}
                }
            },
        },
        **_UNAUTHORIZED,
        **_TMDB_NOT_CONFIGURED,
        **_UPSTREAM,
    },
    'upcoming_movies': {
        200: {
            'description': 'Upcoming releases from TMDB.',
            'content': {'application/json': {'example': [_SEARCH_RESULT_EXAMPLE]}},
        },
        **_UNAUTHORIZED,
        **_TMDB_NOT_CONFIGURED,
        **_UPSTREAM,
    },
    'get_movie': {
        200: {
            'description': 'The catalog entry.',
            'content': {'application/json': {'example': _MOVIE_EXAMPLE}},
        },
        404: {
            'description': 'No catalog entry with this id.',
            'content': {
                'application/json': {
                    'example': {'code': 'NOT_FOUND', 'message': 'Movie not found.'}
                }
            },
        },
        **_UPSTREAM,
    },
    'get_movie_stats': {
        200: {
            'description': "The movie's aggregate rating.",
            'content': {
                'application/json': {
                    'examples': {
                        'has_ratings': {
                            'summary': 'At least one rated log linked to this movie',
                            'value': {
                                'movie_id': '88888888-8888-8888-8888-888888888888',
                                'avg_rating': 4.2,
                                'rating_count': 17,
                            },
                        },
                        'no_ratings_yet': {
                            'summary': 'Movie exists in the catalog, nobody has rated it yet',
                            'value': {
                                'movie_id': '88888888-8888-8888-8888-888888888888',
                                'avg_rating': None,
                                'rating_count': 0,
                            },
                        },
                    }
                }
            },
        },
        **_UPSTREAM,
    },
    'movie_reviews': {
        200: {
            'description': 'Reviews for this movie, most recent first — both '
            '`public` ones (attributed, `username` set) and `anonymous` ones '
            '(`user_id`/`username` both null). `private` reviews never appear here.',
            'content': {
                'application/json': {
                    'example': [
                        {
                            'id': '3fa85f64-5717-4562-b3fc-2c963f66afa6',
                            'user_id': '11111111-1111-1111-1111-111111111111',
                            'username': 'shivco_2141',
                            'movie': 'Kalki 2898 AD',
                            'theater': 'PVR Nexus',
                            'theatre_id': '22222222-2222-2222-2222-222222222222',
                            'rating': 4.5,
                            'notes': 'Loved the visuals.',
                            'created_at': '2026-08-13T04:00:00+00:00',
                            'movie_id': '88888888-8888-8888-8888-888888888888',
                        }
                    ]
                }
            },
        },
        **_UPSTREAM,
    },
}
