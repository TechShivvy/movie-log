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
}
