responses = {
    '/extract': {
        200: {
            'description': 'Successfully extracted movie metadata from the ticket image.',
            'content': {
                'application/json': {
                    'example': {
                        'movie': 'Ekkadiki Pothavu Chinnavada',
                        'date': '2016-12-19',
                        'time': '21:30',
                        'timezone_abbrv': 'IST',
                        'theater': 'Sri Rama Picture Place: Vizag',
                        'seats': ['L18', 'L19', 'L20'],
                        'language': 'Telugu',
                        'screen': 'Balcony',
                        'booking_ref': None,
                        'certificate': 'U/A',
                    }
                }
            },
        },
        400: {
            'description': 'Invalid image file uploaded or bad request.',
            'content': {
                'application/json': {'example': {'detail': 'Invalid image file'}}
            },
        },
        413: {
            'description': 'Uploaded file is too large.',
            'content': {
                'application/json': {
                    'example': {'detail': 'Ticket image must be smaller than X MB'}
                }
            },
        },
        415: {
            'description': 'Uploaded file is not a supported image type.',
            'content': {
                'application/json': {
                    'example': {
                        'detail': 'Invalid file type: detected text/plain. Only images allowed.'
                    }
                }
            },
        },
        500: {
            'description': 'Internal server error or missing OpenRouter API key.',
            'content': {
                'application/json': {
                    'examples': {
                        'parse_error': {
                            'summary': 'Metadata extraction failure',
                            'value': {
                                'detail': 'Failed to parse movie metadata from response or Movie metadata extraction failed',
                            },
                        },
                        'missing_api_key': {
                            'summary': 'Missing OpenRouter API key',
                            'value': {
                                'detail': 'OpenRouter API key is missing. Please provide it in the header or configure it in the backend settings.'
                            },
                        },
                    }
                }
            },
        },
    },
}
