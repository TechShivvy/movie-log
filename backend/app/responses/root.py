responses = {
    '/': {
        200: {
            'description': 'Welcome message',
            'content': {
                'application/json': {
                    'example': {
                        'message': 'Welcome to the Movie Log API! Use the endpoints to extract movie metadata from ticket images.',
                        'version': 'v1.0.0',
                    }
                }
            },
        }
    },
    '/health': {
        200: {
            'description': 'Health check response',
            'content': {
                'application/json': {
                    'example': {
                        'message': 'healthy',
                    }
                }
            },
        }
    },
}
