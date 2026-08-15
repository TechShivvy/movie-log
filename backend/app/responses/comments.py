"""Example request/response bodies for routers/comments.py."""

_COMMENT_EXAMPLE = {
    'id': '55555555-5555-5555-5555-555555555555',
    'movie_log_id': '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    'user_id': '11111111-1111-1111-1111-111111111111',
    'username': 'shivco_2141',
    'parent_comment_id': None,
    'text': 'The IMAX presentation here is great.',
    'like_count': 0,
    'edited_at': None,
    'deleted_at': None,
    'created_at': '2026-08-15T04:00:00+00:00',
    'updated_at': '2026-08-15T04:00:00+00:00',
    'replies': [],
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
    'list_comments': {
        200: {
            'description': "The log's comments, with each top-level one's replies "
            'nested inline.',
            'content': {
                'application/json': {
                    'example': [
                        {
                            **_COMMENT_EXAMPLE,
                            'replies': [
                                {
                                    **_COMMENT_EXAMPLE,
                                    'id': '66666666-6666-6666-6666-666666666666',
                                    'parent_comment_id': _COMMENT_EXAMPLE['id'],
                                    'text': 'Agreed, the seats were a nice touch too.',
                                }
                            ],
                        }
                    ]
                }
            },
        },
        **_UPSTREAM,
    },
    'create_comment': {
        201: {
            'description': 'The created comment.',
            'content': {'application/json': {'example': _COMMENT_EXAMPLE}},
        },
        403: {
            'description': "Either the caller and the log's author have blocked "
            "each other, or parent_comment_id points at a reply rather than a "
            'top-level comment.',
            'content': {
                'application/json': {
                    'example': {
                        'code': 'COMMENT_NOT_ALLOWED',
                        'message': "Can't comment here — either you and this log's "
                        "author have blocked each other, or parent_comment_id "
                        'points at a reply rather than a top-level comment.',
                    }
                }
            },
        },
        404: {
            'description': "No log with this id, or it isn't currently public/"
            'anonymous-visible (private, or archived).',
            'content': {
                'application/json': {
                    'example': {'code': 'NOT_FOUND', 'message': 'Movie log not found.'}
                }
            },
        },
        **_UNAUTHORIZED,
        **_UPSTREAM,
    },
    'update_comment': {
        200: {
            'description': 'The updated comment.',
            'content': {
                'application/json': {
                    'example': {**_COMMENT_EXAMPLE, 'edited_at': '2026-08-15T04:10:00+00:00'}
                }
            },
        },
        404: {
            'description': "No comment with this id belonging to the caller, or "
            "it's already deleted.",
            'content': {
                'application/json': {
                    'example': {'code': 'NOT_FOUND', 'message': 'Comment not found.'}
                }
            },
        },
        **_UNAUTHORIZED,
        **_UPSTREAM,
    },
    'delete_comment': {
        200: {
            'description': 'The now-deleted comment (text cleared, deleted_at set).',
            'content': {
                'application/json': {
                    'example': {
                        **_COMMENT_EXAMPLE,
                        'text': None,
                        'deleted_at': '2026-08-15T04:15:00+00:00',
                    }
                }
            },
        },
        404: {
            'description': "No comment with this id belonging to the caller, or "
            "it's already deleted.",
            'content': {
                'application/json': {
                    'example': {'code': 'NOT_FOUND', 'message': 'Comment not found.'}
                }
            },
        },
        **_UNAUTHORIZED,
        **_UPSTREAM,
    },
    'like_comment': {
        200: {
            'description': 'The updated like count. Liking twice is a no-op, not '
            'an error.',
            'content': {'application/json': {'example': {'like_count': 2}}},
        },
        404: {
            'description': "No comment with this id, or the underlying log isn't "
            'currently visible.',
            'content': {
                'application/json': {
                    'example': {'code': 'NOT_FOUND', 'message': 'Comment not found.'}
                }
            },
        },
        **_UNAUTHORIZED,
        **_UPSTREAM,
    },
    'unlike_comment': {
        200: {
            'description': "The updated like count. Not having liked it in the "
            'first place is a no-op, not an error.',
            'content': {'application/json': {'example': {'like_count': 1}}},
        },
        **_UNAUTHORIZED,
        **_UPSTREAM,
    },
}
