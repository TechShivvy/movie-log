"""Example request/response bodies for routers/auth.py."""

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
        401: {
            'description': 'Missing or invalid Supabase access token.',
            'content': {
                'application/json': {
                    'examples': {
                        'missing': {
                            'summary': 'No token sent',
                            'value': {
                                'code': 'UNAUTHORIZED',
                                'message': 'Missing bearer token.',
                            },
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
        },
    }
}
