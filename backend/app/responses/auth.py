"""Example request/response bodies for routers/auth.py."""

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

_UPSTREAM = {
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
    'me': {
        200: {
            'description': "The identity mapped from the caller's access token. Also "
            'the quickest way to confirm Swagger\'s "Authorize" (top right) actually '
            'worked — try it right after signing in.',
            'content': {
                'application/json': {
                    'example': {
                        'user_id': '11111111-1111-1111-1111-111111111111',
                        'email': 'you@example.com',
                        'is_admin': False,
                    }
                }
            },
        },
        **_UNAUTHORIZED,
    },
    'delete_account': {
        204: {
            'description': 'Account and its owned data deleted. See the endpoint '
            'description for exactly what survives (public/anonymous movie logs and '
            'their venue ratings, anonymized) vs. what does not.',
        },
        400: {
            'description': 'Request body was missing or `confirm` was not `true`.',
            'content': {
                'application/json': {
                    'example': {
                        'code': 'VALIDATION_ERROR',
                        'message': 'Request validation failed',
                        'detail': [
                            {
                                'type': 'literal_error',
                                'loc': ['body', 'confirm'],
                                'msg': 'Input should be True',
                                'input': None,
                            }
                        ],
                    }
                }
            },
        },
        500: {
            'description': 'Backend is missing SUPABASE_SECRET_KEY (or legacy '
            'SUPABASE_SERVICE_ROLE_KEY) — account deletion requires the Auth Admin '
            'API, which the publishable key cannot call.',
            'content': {
                'application/json': {
                    'example': {
                        'code': 'CONFIG_ERROR',
                        'message': 'Supabase admin credentials are not configured on '
                        'the backend. Set SUPABASE_SECRET_KEY (or legacy '
                        'SUPABASE_SERVICE_ROLE_KEY).',
                    }
                }
            },
        },
        502: {
            'description': 'Supabase Auth/Storage was unreachable or rejected the '
            'deletion.',
            'content': {
                'application/json': {
                    'example': {
                        'code': 'UPSTREAM_ERROR',
                        'message': 'Failed to delete the account.',
                    }
                }
            },
        },
        **_UNAUTHORIZED,
    },
    'export_account': {
        200: {
            'description': "The caller's full account data.",
            'content': {
                'application/json': {
                    'example': {
                        'profile': {
                            'username': 'shivco_2141',
                            'display_name': 'Shivcharan',
                            'bio': 'Telugu/Tamil cinema, always front row.',
                            'account_visibility': 'public',
                            'avatar_path': '11111111-1111-1111-1111-111111111111/avatar.jpg',
                            'profile_links': [],
                        },
                        'movie_logs': [
                            {
                                'id': '3fa85f64-5717-4562-b3fc-2c963f66afa6',
                                'movie': 'Ekkadiki Pothavu Chinnavada',
                                'rating': 4.5,
                                'visibility': 'public',
                                'venue_rating': {
                                    'screen_rating': 4.5,
                                    'speaker_rating': 5,
                                    'ac_rating': 3.5,
                                    'seat_rating': 4,
                                },
                            }
                        ],
                        'venue_notes': [
                            {
                                'theatre_id': '22222222-2222-2222-2222-222222222222',
                                'screen_id': None,
                                'note': 'Always ask for row H.',
                            }
                        ],
                    }
                }
            },
        },
        **_UNAUTHORIZED,
    },
    'import_account': {
        200: {
            'description': 'How many of each were imported.',
            'content': {
                'application/json': {
                    'example': {
                        'movie_logs_imported': 12,
                        'venue_ratings_imported': 5,
                        'venue_notes_imported': 3,
                    }
                }
            },
        },
        400: {
            'description': 'No items in either list, or a ticket_image_path not '
            "under the caller's own storage prefix.",
            'content': {
                'application/json': {
                    'examples': {
                        'empty': {
                            'summary': 'Nothing to import',
                            'value': {'code': 'BAD_REQUEST', 'message': 'No items to import.'},
                        },
                        'bad_image_path': {
                            'summary': 'ticket_image_path not under the caller\'s own prefix',
                            'value': {
                                'code': 'INVALID_IMAGE_PATH',
                                'message': "ticket_image_path must live under the caller's own storage prefix.",
                            },
                        },
                    }
                }
            },
        },
        413: {
            'description': 'More than 500 items in movie_logs or venue_notes.',
            'content': {
                'application/json': {
                    'example': {
                        'code': 'IMPORT_TOO_LARGE',
                        'message': 'Cannot import more than 500 movie_logs at once.',
                    }
                }
            },
        },
        422: {
            'description': 'A movie_logs item failed validation, or a venue_notes '
            'item set both/neither of theatre_id and screen_id.',
            'content': {
                'application/json': {
                    'example': {
                        'code': 'VALIDATION_ERROR',
                        'message': 'Request validation failed',
                        'detail': [
                            {
                                'type': 'value_error',
                                'loc': ['body', 'venue_notes', 0],
                                'msg': 'Value error, exactly one of theatre_id/screen_id must be set',
                                'input': {'theatre_id': None, 'screen_id': None, 'note': 'x'},
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
