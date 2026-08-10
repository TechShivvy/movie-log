"""Example request/response bodies for routers/public_profile.py."""

_PROFILE_EXAMPLE = {
    'user_id': '11111111-1111-1111-1111-111111111111',
    'username': 'shivco_2141',
    'display_name': 'Shivcharan',
    'bio': 'Telugu/Tamil cinema, always front row.',
}

_MOVIE_LOG_PUBLIC_EXAMPLE = {
    'id': '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    'user_id': _PROFILE_EXAMPLE['user_id'],
    'movie': 'Ekkadiki Pothavu Chinnavada',
    'watched_date': '2016-12-19',
    'watched_time': '21:30',
    'timezone_abbrv': 'IST',
    'theater': 'Sri Rama Picture Place: Vizag',
    'theatre_id': '22222222-2222-2222-2222-222222222222',
    'language': 'Telugu',
    'screen': 'Balcony',
    'screen_id': '33333333-3333-3333-3333-333333333333',
    'certificate': 'U/A',
    'notes': 'Great sound, comfy seats.',
    'rating': 4.5,
    'created_at': '2026-08-10T03:30:16.719405+00:00',
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

responses = {
    'search_users': {
        200: {
            'description': 'Discoverable users matching the query (username or '
            'display_name, prefix matches on username ranked first). Public — no '
            'auth required.',
            'content': {'application/json': {'example': [_PROFILE_EXAMPLE]}},
        },
        422: {
            'description': 'Query string shorter than 2 characters.',
            'content': {
                'application/json': {
                    'example': {
                        'code': 'VALIDATION_ERROR',
                        'message': 'Request validation failed',
                        'detail': [
                            {
                                'type': 'string_too_short',
                                'loc': ['query', 'q'],
                                'msg': 'String should have at least 2 characters',
                                'input': 'a',
                            }
                        ],
                    }
                }
            },
        },
    },
    'public_profile': {
        200: {
            'description': "The user's public profile plus every movie log they've "
            'marked is_public. Public — no auth required. `logs` deliberately '
            'excludes booking_ref, seats, and ticket_image_path — see the '
            'public_movie_log_entries view (supabase/migrations).',
            'content': {
                'application/json': {
                    'example': {
                        'profile': _PROFILE_EXAMPLE,
                        'logs': [_MOVIE_LOG_PUBLIC_EXAMPLE],
                    }
                }
            },
        },
        404: {
            'description': 'No discoverable user with this username.',
            'content': {
                'application/json': {
                    'example': {'code': 'NOT_FOUND', 'message': 'User not found.'}
                }
            },
        },
    },
    'set_username': {
        200: {
            'description': "The caller's updated settings row.",
            'content': {
                'application/json': {
                    'example': {
                        'user_id': _PROFILE_EXAMPLE['user_id'],
                        'auto_fill': False,
                        'preferred_model': 'qwen/qwen2.5-vl-72b-instruct:free',
                        'created_at': '2026-08-10T03:31:32.522596+00:00',
                        'updated_at': '2026-08-10T03:31:32.522596+00:00',
                        'username': _PROFILE_EXAMPLE['username'],
                        'display_name': None,
                        'bio': None,
                        'is_discoverable': False,
                    }
                }
            },
        },
        409: {
            'description': 'Username already taken by another user.',
            'content': {
                'application/json': {
                    'example': {
                        'code': 'USERNAME_TAKEN',
                        'message': 'That username is already taken.',
                    }
                }
            },
        },
        422: {
            'description': "Doesn't match ^[a-z0-9_]+$, or outside the 3-30 char range.",
            'content': {
                'application/json': {
                    'example': {
                        'code': 'VALIDATION_ERROR',
                        'message': 'Request validation failed',
                        'detail': [
                            {
                                'type': 'string_pattern_mismatch',
                                'loc': ['body', 'username'],
                                'msg': "String should match pattern '^[a-z0-9_]+$'",
                                'input': 'Not Valid!',
                            }
                        ],
                    }
                }
            },
        },
        **_UNAUTHORIZED,
    },
    'set_discoverability': {
        200: {
            'description': "The caller's updated settings row.",
            'content': {
                'application/json': {
                    'example': {
                        'user_id': _PROFILE_EXAMPLE['user_id'],
                        'is_discoverable': True,
                    }
                }
            },
        },
        **_UNAUTHORIZED,
    },
}
