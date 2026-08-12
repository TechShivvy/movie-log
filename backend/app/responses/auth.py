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
}
