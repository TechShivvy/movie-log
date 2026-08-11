"""Example request/response bodies for routers/follows.py."""

_FOLLOW_EXAMPLE = {
    'follower_id': '11111111-1111-1111-1111-111111111111',
    'followee_id': '22222222-2222-2222-2222-222222222222',
    'status': 'accepted',
    'created_at': '2026-08-11T03:30:16.719405+00:00',
    'updated_at': '2026-08-11T03:30:16.719405+00:00',
}

_PENDING_FOLLOW_EXAMPLE = {**_FOLLOW_EXAMPLE, 'status': 'pending'}

_FEED_LOG_EXAMPLE = {
    'id': '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    'user_id': _FOLLOW_EXAMPLE['followee_id'],
    'username': 'shivco_2141',
    'display_name': 'Shivcharan',
    'avatar_path': None,
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

_FOLLOW_USER_EXAMPLE = {
    'user_id': _FOLLOW_EXAMPLE['follower_id'],
    'username': 'reginald_chase',
    'display_name': None,
    'avatar_path': None,
    'followed_at': '2026-08-11T03:30:16.719405+00:00',
}

_UNAUTHORIZED = {
    401: {
        'description': 'Missing or invalid Supabase access token.',
        'content': {
            'application/json': {
                'example': {'code': 'UNAUTHORIZED', 'message': 'Missing bearer token.'}
            }
        },
    }
}

_NOT_FOUND_USER = {
    404: {
        'description': 'No user with this username.',
        'content': {
            'application/json': {
                'example': {'code': 'NOT_FOUND', 'message': 'User not found.'}
            }
        },
    }
}

# Every endpoint here calls services/supabase_rest.py, which forwards to
# PostgREST/Supabase and re-raises non-2xx responses as APIError.
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
    'create_follow': {
        200: {
            'description': 'The created follow relationship — accepted if the '
            'target is public, pending otherwise.',
            'content': {
                'application/json': {
                    'examples': {
                        'accepted': {'summary': 'Target account is public', 'value': _FOLLOW_EXAMPLE},
                        'pending': {
                            'summary': 'Target account is followers_only/private',
                            'value': _PENDING_FOLLOW_EXAMPLE,
                        },
                    }
                }
            },
        },
        400: {
            'description': 'Followed own username.',
            'content': {
                'application/json': {
                    'example': {'code': 'SELF_FOLLOW', 'message': 'Cannot follow yourself.'}
                }
            },
        },
        403: {
            'description': 'A block exists between the caller and this user, in '
            'either direction.',
            'content': {
                'application/json': {
                    'examples': {
                        'i_blocked_them': {
                            'summary': 'Caller blocked this user',
                            'value': {'code': 'BLOCKED', 'message': 'You have blocked this user.'},
                        },
                        'they_blocked_me': {
                            'summary': 'This user blocked the caller',
                            'value': {
                                'code': 'BLOCKED',
                                'message': 'You have been blocked by this user.',
                            },
                        },
                    }
                }
            },
        },
        409: {
            'description': 'Already following (or already have a pending request '
            'to) this user.',
            'content': {
                'application/json': {
                    'example': {'code': 'ALREADY_FOLLOWING', 'message': 'Already following this user.'}
                }
            },
        },
        **_NOT_FOUND_USER,
        **_UNAUTHORIZED,
        **_UPSTREAM,
    },
    'delete_follow': {
        200: {
            'description': 'Unfollowed.',
            'content': {'application/json': {'example': {'status': 'unfollowed'}}},
        },
        404: {
            'description': 'Not following this user (or no such user).',
            'content': {
                'application/json': {
                    'example': {'code': 'NOT_FOUND', 'message': 'Not following this user.'}
                }
            },
        },
        **_UNAUTHORIZED,
        **_UPSTREAM,
    },
    'accept_follow': {
        200: {
            'description': 'The now-accepted follow relationship.',
            'content': {'application/json': {'example': _FOLLOW_EXAMPLE}},
        },
        404: {
            'description': 'No pending follow request from this user (or no such user).',
            'content': {
                'application/json': {
                    'example': {
                        'code': 'NOT_FOUND',
                        'message': 'No pending follow request from this user.',
                    }
                }
            },
        },
        **_UNAUTHORIZED,
        **_UPSTREAM,
    },
    'remove_follower': {
        200: {
            'description': 'Removed.',
            'content': {'application/json': {'example': {'status': 'removed'}}},
        },
        404: {
            'description': 'Not a follower or pending requester (or no such user).',
            'content': {
                'application/json': {
                    'example': {'code': 'NOT_FOUND', 'message': 'Not a follower or pending requester.'}
                }
            },
        },
        **_UNAUTHORIZED,
        **_UPSTREAM,
    },
    'list_follow_requests': {
        200: {
            'description': "The caller's pending incoming follow requests, newest first.",
            'content': {'application/json': {'example': [_PENDING_FOLLOW_EXAMPLE]}},
        },
        **_UNAUTHORIZED,
        **_UPSTREAM,
    },
    'create_block': {
        200: {
            'description': 'Blocked.',
            'content': {'application/json': {'example': {'status': 'blocked'}}},
        },
        400: {
            'description': 'Blocked own username.',
            'content': {
                'application/json': {
                    'example': {'code': 'SELF_BLOCK', 'message': 'Cannot block yourself.'}
                }
            },
        },
        409: {
            'description': 'Already blocked.',
            'content': {
                'application/json': {
                    'example': {'code': 'ALREADY_BLOCKED', 'message': 'Already blocked.'}
                }
            },
        },
        **_NOT_FOUND_USER,
        **_UNAUTHORIZED,
        **_UPSTREAM,
    },
    'list_followers': {
        200: {
            'description': "The user's accepted followers — empty if the caller "
            "can't view this account's content (followers_only/private and not "
            'an accepted follower), same gating as the profile route.',
            'content': {'application/json': {'example': [_FOLLOW_USER_EXAMPLE]}},
        },
        **_NOT_FOUND_USER,
        **_UPSTREAM,
    },
    'list_following': {
        200: {
            'description': "Who the user follows — same gating as .../followers.",
            'content': {'application/json': {'example': [_FOLLOW_USER_EXAMPLE]}},
        },
        **_NOT_FOUND_USER,
        **_UPSTREAM,
    },
    'list_feed': {
        200: {
            'description': "The caller's feed — public logs from accepted-follow "
            'accounts, newest watched_date first. Never includes the caller\'s '
            "own logs.",
            'content': {'application/json': {'example': [_FEED_LOG_EXAMPLE]}},
        },
        **_UNAUTHORIZED,
        **_UPSTREAM,
    },
    'delete_block': {
        200: {
            'description': 'Unblocked.',
            'content': {'application/json': {'example': {'status': 'unblocked'}}},
        },
        404: {
            'description': 'Not blocked (or no such user).',
            'content': {
                'application/json': {
                    'example': {'code': 'NOT_FOUND', 'message': 'Not blocked.'}
                }
            },
        },
        **_UNAUTHORIZED,
        **_UPSTREAM,
    },
}
