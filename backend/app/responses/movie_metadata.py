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
        500: {
            'description': 'Internal server error occurred during movie metadata extraction.',
            'content': {
                'application/json': {
                    'example': {
                        'detail': 'Failed to parse movie metadata from response or Movie metadata extraction failed',
                    }
                }
            },
        },
    },
}
