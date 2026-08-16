"""Example request/response bodies for routers/notifications.py."""

_NOTIFICATION_EXAMPLE = {
    'id': '77777777-7777-7777-7777-777777777777',
    'recipient_id': '11111111-1111-1111-1111-111111111111',
    'actor_id': '22222222-2222-2222-2222-222222222222',
    'type': 'new_comment',
    'movie_log_id': '33333333-3333-3333-3333-333333333333',
    'comment_id': '44444444-4444-4444-4444-444444444444',
    'report_id': None,
    'read': False,
    'created_at': '2026-08-13T04:00:00+00:00',
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
    'list_notifications': {
        200: {
            'description': "The caller's notifications, newest first.",
            'content': {'application/json': {'example': [_NOTIFICATION_EXAMPLE]}},
        },
        **_UNAUTHORIZED,
        **_UPSTREAM,
    },
    'mark_read': {
        200: {
            'description': 'The updated notification.',
            'content': {
                'application/json': {'example': {**_NOTIFICATION_EXAMPLE, 'read': True}}
            },
        },
        404: {
            'description': "No notification with this id belonging to the caller.",
            'content': {
                'application/json': {
                    'example': {'code': 'NOT_FOUND', 'message': 'Notification not found.'}
                }
            },
        },
        **_UNAUTHORIZED,
        **_UPSTREAM,
    },
    'mark_all_read': {
        200: {
            'description': 'How many notifications were marked read.',
            'content': {'application/json': {'example': {'marked_read': 3}}},
        },
        **_UNAUTHORIZED,
        **_UPSTREAM,
    },
}
