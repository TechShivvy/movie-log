"""Example request/response bodies for routers/public_profile.py."""

_PROFILE_EXAMPLE = {
    'user_id': '11111111-1111-1111-1111-111111111111',
    'username': 'shivco_2141',
    'display_name': 'Shivcharan',
    'bio': 'Telugu/Tamil cinema, always front row.',
    'is_public': True,
}

# What GET /users/{username} returns for a private account (is_public=false)
# — the route still resolves, just with no logs.
_PRIVATE_PROFILE_EXAMPLE = {**_PROFILE_EXAMPLE, 'is_public': False}

# Matches public.public_movie_log_entries' actual column list (migrations
# 20260810000001, 20260811000008) — no booking_ref/seats/ticket_image_path
# (identifying/private), and no price/currency either (personal financial
# detail, same reasoning). format is here since it's no more sensitive
# than the already-public language/screen/certificate.
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
    'format': '2D',
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

# Every endpoint here calls services/supabase_rest.py, which forwards to
# PostgREST/Supabase and re-raises non-2xx responses as APIError — these
# are possible on every operation below, authenticated or not.
_UPSTREAM = {
    403: {
        'description': "Row Level Security denied the operation. Shouldn't happen "
        'through normal use of this API, but is a real possible response if RLS '
        'policies ever diverge from what the backend assumes.',
        'content': {
            'application/json': {
                'example': {
                    'code': 'FORBIDDEN',
                    'message': 'You do not have access to this resource.',
                }
            }
        },
    },
    502: {
        'description': 'Supabase/PostgREST is unreachable, timed out, or returned a '
        'server error.',
        'content': {
            'application/json': {
                'example': {
                    'code': 'UPSTREAM_ERROR',
                    'message': 'Database service is unavailable.',
                }
            }
        },
    },
}

responses = {
    'search_users': {
        200: {
            'description': 'Users matching the query (username or display_name, '
            'prefix matches on username ranked first). Public — no auth required, '
            'and unrestricted by privacy state — private accounts are included, '
            'with `is_public: false` so the client can show a lock indicator.',
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
        **_UPSTREAM,
    },
    'public_profile': {
        200: {
            'description': 'Resolves by username alone. If the account is public '
            '(`is_public: true`), `logs` has every movie log set to `visibility: '
            "public` (never `anonymous` ones — by definition, those don't show up "
            'attributed to anyone); if private, `logs` is empty. Public — no auth '
            'required. '
            '`logs` deliberately excludes booking_ref, seats, and ticket_image_path '
            '— see the public_movie_log_entries view (supabase/migrations).',
            'content': {
                'application/json': {
                    'examples': {
                        'public_account': {
                            'summary': 'is_public: true — logs included',
                            'value': {
                                'profile': _PROFILE_EXAMPLE,
                                'logs': [_MOVIE_LOG_PUBLIC_EXAMPLE],
                            },
                        },
                        'private_account': {
                            'summary': 'is_public: false — profile shell only',
                            'value': {'profile': _PRIVATE_PROFILE_EXAMPLE, 'logs': []},
                        },
                    }
                }
            },
        },
        404: {
            'description': 'No user with this username.',
            'content': {
                'application/json': {
                    'example': {'code': 'NOT_FOUND', 'message': 'User not found.'}
                }
            },
        },
        422: {
            # FastAPI documents a 422 by default on every endpoint with a request
            # parameter, even a plain `str` path param like `username` that can't
            # actually fail type coercion. Kept (rather than omitted) so the
            # envelope shown matches reality — {code, message, detail} via
            # utils/errors.py:validation_exception_handler — not FastAPI's
            # default HTTPValidationError shape.
            'description': "Present for completeness — username is a plain "
            'string path param, so this is not realistically reachable.',
            'content': {
                'application/json': {
                    'example': {
                        'code': 'VALIDATION_ERROR',
                        'message': 'Request validation failed',
                        'detail': [],
                    }
                }
            },
        },
        **_UPSTREAM,
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
                        'is_public': False,
                        'prefill_repeat_visit': False,
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
        500: {
            'description': 'Backend misconfiguration, or (rare defensive check) the '
            'upsert reported success but PostgREST returned no row.',
            'content': {
                'application/json': {
                    'examples': {
                        'config_error': {
                            'summary': 'Backend is missing required Supabase configuration',
                            'value': {
                                'code': 'CONFIG_ERROR',
                                'message': 'Supabase URL is not configured on the backend.',
                            },
                        },
                        'no_row_returned': {
                            'summary': 'Upsert succeeded but returned no row (should not happen)',
                            'value': {
                                'code': 'INTERNAL_ERROR',
                                'message': 'Username update returned no row.',
                            },
                        },
                    }
                }
            },
        },
        **_UNAUTHORIZED,
        **_UPSTREAM,
    },
    'set_privacy': {
        200: {
            'description': "The caller's updated settings row.",
            'content': {
                'application/json': {
                    'example': {
                        'user_id': _PROFILE_EXAMPLE['user_id'],
                        'is_public': True,
                    }
                }
            },
        },
        422: {
            'description': 'is_public was not a boolean.',
            'content': {
                'application/json': {
                    'example': {
                        'code': 'VALIDATION_ERROR',
                        'message': 'Request validation failed',
                        'detail': [
                            {
                                'type': 'bool_parsing',
                                'loc': ['body', 'is_public'],
                                'msg': 'Input should be a valid boolean',
                                'input': 'yes please',
                            }
                        ],
                    }
                }
            },
        },
        **_UNAUTHORIZED,
        **_UPSTREAM,
    },
    'set_revisit_prefill': {
        200: {
            'description': "The caller's updated settings row.",
            'content': {
                'application/json': {
                    'example': {
                        'user_id': _PROFILE_EXAMPLE['user_id'],
                        'prefill_repeat_visit': True,
                    }
                }
            },
        },
        422: {
            'description': 'prefill_repeat_visit was not a boolean.',
            'content': {
                'application/json': {
                    'example': {
                        'code': 'VALIDATION_ERROR',
                        'message': 'Request validation failed',
                        'detail': [
                            {
                                'type': 'bool_parsing',
                                'loc': ['body', 'prefill_repeat_visit'],
                                'msg': 'Input should be a valid boolean',
                                'input': 'yes please',
                            }
                        ],
                    }
                }
            },
        },
        **_UNAUTHORIZED,
        **_UPSTREAM,
    },
}
