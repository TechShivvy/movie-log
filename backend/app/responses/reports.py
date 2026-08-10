"""Example request/response bodies for routers/reports.py."""

_REPORT_EXAMPLE = {
    'id': '66666666-6666-6666-6666-666666666666',
    'reporter_user_id': '11111111-1111-1111-1111-111111111111',
    'target_type': 'theatre',
    'target_id': '22222222-2222-2222-2222-222222222222',
    'reason': "This theatre closed down last year, shouldn't be listed anymore.",
    'status': 'open',
    'reviewed_by': None,
    'reviewed_at': None,
    'created_at': '2026-08-11T03:30:16.719405+00:00',
    'updated_at': '2026-08-11T03:30:16.719405+00:00',
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
    'create_report': {
        201: {
            'description': 'The stored report — created, or overwritten if the '
            'caller had already reported this same target before.',
            'content': {'application/json': {'example': _REPORT_EXAMPLE}},
        },
        404: {
            'description': "target_id doesn't exist, or (movie_log) exists but is "
            "`private`, or (profile) exists but isn't discoverable — either way "
            "there's nothing reportable at that target_type/target_id.",
            'content': {
                'application/json': {
                    'example': {
                        'code': 'NOT_FOUND',
                        'message': 'Nothing reportable found for this target_type/target_id.',
                    }
                }
            },
        },
        422: {
            'description': 'target_type not one of movie_log/profile/theatre/screen, '
            'or reason is blank.',
            'content': {
                'application/json': {
                    'example': {
                        'code': 'VALIDATION_ERROR',
                        'message': 'Request validation failed',
                        'detail': [
                            {
                                'type': 'literal_error',
                                'loc': ['body', 'target_type'],
                                'msg': "Input should be 'movie_log', 'profile', "
                                "'theatre' or 'screen'",
                                'input': 'showtime',
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
