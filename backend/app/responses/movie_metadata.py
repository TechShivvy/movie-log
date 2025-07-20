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
            'description': 'Invalid image file or bad request.',
            'content': {
                'application/json': {
                    'example': {'detail': 'Bad request. Please check input format.'}
                }
            },
        },
        401: {
            'description': 'OpenAI API authentication failed.',
            'content': {
                'application/json': {'example': {'detail': 'Invalid API key.'}}
            },
        },
        403: {
            'description': 'OpenAI permission denied.',
            'content': {
                'application/json': {'example': {'detail': 'Permission denied.'}}
            },
        },
        408: {
            'description': 'OpenAI request timed out.',
            'content': {
                'application/json': {
                    'example': {'detail': 'Request to OpenAI timed out.'}
                }
            },
        },
        413: {
            'description': 'Uploaded file is too large or exceeds context limits.',
            'content': {
                'application/json': {
                    'examples': {
                        'too_large': {
                            'summary': 'File too large',
                            'value': {
                                'detail': 'Ticket image must be smaller than X MB'
                            },
                        },
                        'context_limit': {
                            'summary': 'Context limit exceeded after optimization',
                            'value': {
                                'detail': 'Image could not be optimized to fit context limits. Try a smaller or simpler image.'
                            },
                        },
                    }
                }
            },
        },
        415: {
            'description': 'Unsupported file type.',
            'content': {
                'application/json': {
                    'example': {
                        'detail': 'Invalid file type: detected text/plain. Only images allowed.'
                    }
                }
            },
        },
        429: {
            'description': 'Rate limit exceeded.',
            'content': {
                'application/json': {
                    'example': {'detail': 'Too many requests. Please try again later.'}
                }
            },
        },
        500: {
            'description': 'Internal server error or parsing failure.',
            'content': {
                'application/json': {
                    'examples': {
                        'parse_error': {
                            'summary': 'Response parsing failed',
                            'value': {
                                'detail': 'Failed to parse movie metadata from response',
                            },
                        },
                        'missing_api_key': {
                            'summary': 'Missing OpenRouter API key',
                            'value': {
                                'detail': 'OpenRouter API key is missing. Please provide it in the header or configure it in the backend settings.'
                            },
                        },
                        'generic': {
                            'summary': 'Unexpected internal error',
                            'value': {
                                'detail': 'Unexpected error from upstream service.'
                            },
                        },
                    }
                }
            },
        },
        502: {
            'description': 'Connection failure or OpenAI error.',
            'content': {
                'application/json': {
                    'example': {
                        'detail': 'Unable to connect to OpenAI. Please retry later.'
                    }
                }
            },
        },
    }
}
