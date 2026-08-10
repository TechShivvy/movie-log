"""Example request/response bodies for routers/venues.py.

Keyed by operation (function name), since /theatres/{theatre_id}/screens
serves both GET (list_screens) and POST (create_screen).
"""

_THEATRE_EXAMPLE = {
    'id': '22222222-2222-2222-2222-222222222222',
    'name': 'PVR Nexus',
    'chain': 'PVR',
    'city': 'Chennai',
    'state': 'Tamil Nadu',
    'country': 'IN',
    'lat': 13.0605,
    'lng': 80.2087,
    'place_id': 'ChIJ_______example_______',
    'formatted_address': 'Nexus Mall, Vadapalani, Chennai, Tamil Nadu 600026',
}

_SCREEN_EXAMPLE = {
    'id': '33333333-3333-3333-3333-333333333333',
    'theatre_id': _THEATRE_EXAMPLE['id'],
    'name': 'Screen 4 - IMAX',
    'screen_type': 'IMAX',
}

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

_VALIDATION = {
    422: {
        'description': 'Request body failed schema validation.',
        'content': {
            'application/json': {
                'example': {
                    'code': 'VALIDATION_ERROR',
                    'message': 'Request validation failed',
                    'detail': [
                        {
                            'type': 'string_too_short',
                            'loc': ['body', 'query'],
                            'msg': 'String should have at least 2 characters',
                            'input': 'P',
                        }
                    ],
                }
            }
        },
    }
}

responses = {
    'match_theatres': {
        200: {
            'description': "Candidate theatres ranked by name similarity — a "
            '"did you mean" prompt, not an auto-merge. Empty list means no close '
            'match; the client should offer "create new theatre" instead.',
            'content': {
                'application/json': {
                    'example': [
                        {
                            'id': _THEATRE_EXAMPLE['id'],
                            'name': _THEATRE_EXAMPLE['name'],
                            'chain': _THEATRE_EXAMPLE['chain'],
                            'city': _THEATRE_EXAMPLE['city'],
                            'formatted_address': _THEATRE_EXAMPLE['formatted_address'],
                            'similarity': 0.87,
                        }
                    ]
                }
            },
        },
        **_UNAUTHORIZED,
        **_VALIDATION,
    },
    'create_theatre': {
        201: {
            'description': 'The created theatre — or an existing one, unchanged, if '
            'place_id already matched one (place_id is the real dedup key; the '
            '/theatres/match endpoint above is only ever a UI prompt, never used '
            'for auto-merging).',
            'content': {'application/json': {'example': _THEATRE_EXAMPLE}},
        },
        **_UNAUTHORIZED,
        **_VALIDATION,
    },
    'list_screens': {
        200: {
            'description': 'All screens for this theatre.',
            'content': {'application/json': {'example': [_SCREEN_EXAMPLE]}},
        },
        **_UNAUTHORIZED,
    },
    'create_screen': {
        201: {
            'description': 'The created screen.',
            'content': {'application/json': {'example': _SCREEN_EXAMPLE}},
        },
        **_UNAUTHORIZED,
        **_VALIDATION,
    },
    'theatre_stats': {
        200: {
            'description': 'Aggregate ratings across every screen at this theatre. '
            'Public — no auth required. Kept fresh by a database trigger on every '
            'venue-rating change, not computed on read.',
            'content': {
                'application/json': {
                    'example': {
                        'theatre_id': _THEATRE_EXAMPLE['id'],
                        'overall': {
                            'screen_rating': {'avg': 4.5, 'count': 12},
                            'speaker_rating': {'avg': 4.7, 'count': 12},
                            'ac_rating': {'avg': 3.9, 'count': 10},
                            'seat_rating': {'avg': 4.1, 'count': 11},
                        },
                        'computed_at': '2026-08-10T03:31:15.977764+00:00',
                    }
                }
            },
        },
    },
    'screen_stats': {
        200: {
            'description': 'Aggregate ratings for this specific screen. Public — no '
            'auth required.',
            'content': {
                'application/json': {
                    'example': {
                        'screen_id': _SCREEN_EXAMPLE['id'],
                        'categories': {
                            'screen_rating': {'avg': 4.5, 'count': 6},
                            'speaker_rating': {'avg': 5.0, 'count': 6},
                            'ac_rating': {'avg': 3.5, 'count': 5},
                            'seat_rating': {'avg': 4.0, 'count': 6},
                        },
                        'computed_at': '2026-08-10T03:31:15.977764+00:00',
                    }
                }
            },
        },
    },
}
