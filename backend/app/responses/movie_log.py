"""Example request/response bodies for routers/movie_logs.py.

Keyed by operation (function name in the router), not by path, since
several operations share the same path (`''` for list/create,
`/{log_id}` for get/update/delete) and OpenAPI needs one `responses`
dict per operation.

All error bodies use the real shape produced by utils/errors.py's
exception handlers: `{"code": "...", "message": "...", "detail": <optional>}`.
"""

_MOVIE_LOG_EXAMPLE = {
    'id': '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    'user_id': '11111111-1111-1111-1111-111111111111',
    'movie': 'Ekkadiki Pothavu Chinnavada',
    'watched_date': '2016-12-19',
    'watched_time': '21:30',
    'timezone_abbrv': 'IST',
    'theater': 'Sri Rama Picture Place: Vizag',
    'seats': ['L18', 'L19', 'L20'],
    'language': 'Telugu',
    'screen': 'Balcony',
    'booking_ref': 'BMS12345678',
    'certificate': 'U/A',
    'notes': 'Great sound, comfy seats.',
    'rating': 4.5,
    'ticket_image_path': None,
    'theatre_id': None,
    'screen_id': None,
    'is_public': False,
    'created_at': '2026-08-10T03:30:16.719405+00:00',
    'updated_at': '2026-08-10T03:30:16.719405+00:00',
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

_NOT_FOUND = {
    404: {
        'description': "Log doesn't exist, or belongs to a different user (RLS makes "
        "the two indistinguishable on purpose).",
        'content': {
            'application/json': {
                'example': {'code': 'NOT_FOUND', 'message': 'Movie log not found.'}
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
                            'type': 'value_error',
                            'loc': ['body', 'rating'],
                            'msg': 'Value error, rating must be between 0.5 and 5 '
                            'in 0.5 increments',
                            'input': 4.3,
                        }
                    ],
                }
            }
        },
    }
}

responses = {
    'list_logs': {
        200: {
            'description': 'A page of the caller\'s own movie logs.',
            'content': {'application/json': {'example': [_MOVIE_LOG_EXAMPLE]}},
        },
        400: {
            'description': 'Invalid sort field.',
            'content': {
                'application/json': {
                    'example': {'code': 'BAD_REQUEST', 'message': 'Invalid sort field.'}
                }
            },
        },
        **_UNAUTHORIZED,
    },
    'create_log': {
        201: {
            'description': 'The created log.',
            'content': {'application/json': {'example': _MOVIE_LOG_EXAMPLE}},
        },
        400: {
            'description': 'Missing required field, or ticket_image_path outside the '
            "caller's own storage prefix.",
            'content': {
                'application/json': {
                    'examples': {
                        'missing_movie_title': {
                            'summary': 'No movie title given',
                            'value': {
                                'code': 'MISSING_MOVIE_TITLE',
                                'message': 'movie title is required when creating a log.',
                            },
                        },
                        'invalid_image_path': {
                            'summary': 'ticket_image_path outside the caller\'s own prefix',
                            'value': {
                                'code': 'INVALID_IMAGE_PATH',
                                'message': "ticket_image_path must live under the "
                                "user's own storage prefix.",
                            },
                        },
                    }
                }
            },
        },
        429: {
            'description': 'More than 30 creates in a minute.',
            'content': {
                'application/json': {
                    'example': {
                        'code': 'RATE_LIMIT_MINUTE',
                        'message': 'Too many requests in a short time. Please slow '
                        'down and retry shortly.',
                        'detail': {'limit': '30'},
                    }
                }
            },
        },
        **_UNAUTHORIZED,
        **_VALIDATION,
    },
    'export_logs': {
        200: {
            'description': 'All of the caller\'s logs, for backup/migration.',
            'content': {
                'application/json': {
                    'example': {'count': 1, 'items': [_MOVIE_LOG_EXAMPLE]}
                }
            },
        },
        **_UNAUTHORIZED,
    },
    'import_logs': {
        200: {
            'description': 'Logs created from a previously exported (or hand-built) list.',
            'content': {
                'application/json': {
                    'example': {'imported': 1, 'items': [_MOVIE_LOG_EXAMPLE]}
                }
            },
        },
        400: {
            'description': 'Empty items list.',
            'content': {
                'application/json': {
                    'example': {'code': 'BAD_REQUEST', 'message': 'No items to import.'}
                }
            },
        },
        413: {
            'description': 'More than 500 items in one request.',
            'content': {
                'application/json': {
                    'example': {
                        'code': 'IMPORT_TOO_LARGE',
                        'message': 'Cannot import more than 500 items at once.',
                    }
                }
            },
        },
        429: {
            'description': 'More than 6 imports in a minute.',
            'content': {
                'application/json': {
                    'example': {
                        'code': 'RATE_LIMIT_MINUTE',
                        'message': 'Too many requests in a short time. Please slow '
                        'down and retry shortly.',
                        'detail': {'limit': '6'},
                    }
                }
            },
        },
        **_UNAUTHORIZED,
    },
    'get_log': {
        200: {
            'description': 'The requested log.',
            'content': {'application/json': {'example': _MOVIE_LOG_EXAMPLE}},
        },
        **_UNAUTHORIZED,
        **_NOT_FOUND,
    },
    'update_log': {
        200: {
            'description': 'The updated log.',
            'content': {
                'application/json': {
                    'example': {**_MOVIE_LOG_EXAMPLE, 'rating': 5, 'is_public': True}
                }
            },
        },
        400: {
            'description': 'Empty patch body.',
            'content': {
                'application/json': {
                    'example': {
                        'code': 'BAD_REQUEST',
                        'message': 'No fields provided to update.',
                    }
                }
            },
        },
        **_UNAUTHORIZED,
        **_NOT_FOUND,
        **_VALIDATION,
    },
    'upsert_venue_rating': {
        200: {
            'description': 'The stored venue-rating row for this log (screen/speaker/'
            'AC/seat, half-star 0.5-5.0).',
            'content': {
                'application/json': {
                    'example': {
                        'movie_log_id': _MOVIE_LOG_EXAMPLE['id'],
                        'user_id': _MOVIE_LOG_EXAMPLE['user_id'],
                        'screen_rating': 4.5,
                        'speaker_rating': 5.0,
                        'ac_rating': 3.5,
                        'seat_rating': 4.0,
                        'created_at': '2026-08-10T03:31:15.977764+00:00',
                        'updated_at': '2026-08-10T03:31:15.977764+00:00',
                    }
                }
            },
        },
        400: {
            'description': 'No rating fields given (all four are optional individually, '
            'but at least one is required).',
            'content': {
                'application/json': {
                    'example': {
                        'code': 'BAD_REQUEST',
                        'message': 'No rating fields provided.',
                    }
                }
            },
        },
        **_UNAUTHORIZED,
        **_NOT_FOUND,
        **_VALIDATION,
    },
    'delete_log': {
        204: {'description': 'Deleted — no response body.'},
        **_UNAUTHORIZED,
        **_NOT_FOUND,
    },
}
