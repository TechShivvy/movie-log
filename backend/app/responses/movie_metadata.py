responses = {
    'extract-from-link': {
        200: {
            'description': 'Successfully extracted movie metadata from the ticket link.',
            'content': {
                'application/json': {
                    'example': {
                        'movie': 'Spider-Man: Brand New Day',
                        'date': '2026-07-31',
                        'time': '16:40',
                        'timezone_abbrv': 'IST',
                        'theater': 'Cinepolis: BSR Mall, OMR, Thoraipakkam',
                        'seats': ['J25', 'J26'],
                        'language': 'English',
                        'screen': 'AUDI06',
                        'booking_ref': 'WNJ2T8D',
                        'certificate': None,
                    }
                }
            },
        },
        400: {
            'description': 'The URL is malformed, not http(s), or its host is not on '
            'the supported-ticketing-site allowlist — checked before any scraping is '
            'attempted, so this never spends quota. Also covers the shared-key-must-'
            'be-free-model rule, same as /extract.',
            'content': {
                'application/json': {
                    'examples': {
                        'unsupported_site': {
                            'summary': 'Host is not a supported ticketing site',
                            'value': {
                                'code': 'UNSUPPORTED_LINK',
                                'message': 'example.com is not a supported ticketing site yet.',
                            },
                        },
                        'shared_model_not_free': {
                            'summary': 'Non-free model requested without an own API key',
                            'value': {
                                'code': 'BAD_REQUEST',
                                'message': 'Selected shared model must be a free model.',
                            },
                        },
                    }
                }
            },
        },
        401: {
            'description': 'Missing/invalid sign-in, or (if you supplied your own key) '
            'OpenRouter rejected it — same two independent locks as /extract.',
            'content': {
                'application/json': {
                    'example': {'code': 'UNAUTHORIZED', 'message': 'Missing bearer token.'}
                }
            },
        },
        422: {
            'description': "The link is on a supported site but couldn't actually be "
            'read — a real, expected outcome (page structure changed, the specific '
            "booking is no longer accessible, a transient block), not a bug. Frontend "
            'should treat this as a signal to offer photo upload instead, not as an error '
            'to alarm the user with.',
            'content': {
                'application/json': {
                    'example': {
                        'code': 'LINK_EXTRACTION_FAILED',
                        'message': "Couldn't read that link — try uploading a photo of the ticket instead.",
                    }
                }
            },
        },
        429: {
            'description': 'One of two independent limits — distinguish by `code`.',
            'content': {
                'application/json': {
                    'examples': {
                        'per_minute_rate_limit': {
                            'summary': 'Too many requests in a short window',
                            'value': {
                                'code': 'RATE_LIMIT_MINUTE',
                                'message': 'Too many requests in a short time. Please '
                                'slow down and retry shortly.',
                            },
                        },
                        'daily_quota_exceeded': {
                            'summary': 'Shared-key daily cap reached',
                            'value': {
                                'code': 'QUOTA_DAILY_EXCEEDED',
                                'message': 'Daily free extraction limit reached. Add your '
                                'own OpenRouter API key in settings or try again tomorrow.',
                            },
                        },
                    }
                }
            },
        },
        500: {
            'description': 'Internal server error, or the headless browser is '
            'unavailable on this deployment (fails open at startup — see app.py '
            'lifespan — rather than the whole API refusing to start).',
            'content': {
                'application/json': {
                    'example': {
                        'code': 'INTERNAL_ERROR',
                        'message': 'Link extraction is not available right now.',
                    }
                }
            },
        },
        502: {
            'description': 'Could not reach OpenRouter/OpenAI, or it returned a '
            'non-JSON / invalid response.',
            'content': {
                'application/json': {
                    'example': {
                        'code': 'UPSTREAM_ERROR',
                        'message': 'Unable to connect to OpenAI. Please retry later.',
                    }
                }
            },
        },
    },
    'test-key': {
        200: {
            'description': 'Key/model check result — always 200 once signed in and a '
            'key was supplied; an invalid key or nonexistent model comes back as '
            '`valid: false` / `model.exists: false`, not an error status, since '
            "that's itself a useful answer here.",
            'content': {
                'application/json': {
                    'examples': {
                        'valid_key_with_model': {
                            'summary': 'Valid key, model given and found, supports images',
                            'value': {
                                'valid': True,
                                'is_free_tier': False,
                                'usage': 0.42,
                                'limit': None,
                                'limit_remaining': None,
                                'model': {
                                    'requested': 'qwen/qwen2.5-vl-72b-instruct:free',
                                    'exists': True,
                                    'name': 'Qwen: Qwen2.5 VL 72B Instruct (free)',
                                    'input_modalities': ['text', 'image'],
                                    'supports_image_input': True,
                                    'is_free': True,
                                    'context_length': 131072,
                                },
                            },
                        },
                        'invalid_key': {
                            'summary': 'Key rejected by OpenRouter',
                            'value': {'valid': False, 'model': None},
                        },
                        'model_not_given': {
                            'summary': 'Key checked, no model requested',
                            'value': {
                                'valid': True,
                                'is_free_tier': False,
                                'usage': 0.42,
                                'limit': None,
                                'limit_remaining': None,
                                'model': None,
                            },
                        },
                        'model_not_found': {
                            'summary': "Model id doesn't exist in OpenRouter's catalog",
                            'value': {
                                'valid': True,
                                'is_free_tier': False,
                                'usage': 0.42,
                                'limit': None,
                                'limit_remaining': None,
                                'model': {'requested': 'made-up/not-a-real-model', 'exists': False},
                            },
                        },
                    }
                }
            },
        },
        400: {
            'description': 'No X-OpenRouter-API-Key header supplied — this endpoint '
            'only makes sense for testing a key you provide, there is no shared-key '
            'fallback here.',
            'content': {
                'application/json': {
                    'example': {
                        'code': 'BAD_REQUEST',
                        'message': 'Provide a key to test via the X-OpenRouter-API-Key header.',
                    }
                }
            },
        },
        401: {
            'description': 'Missing/invalid sign-in to this API (not the OpenRouter key '
            'being tested — an invalid OpenRouter key is a 200 with valid: false).',
            'content': {
                'application/json': {
                    'example': {'code': 'UNAUTHORIZED', 'message': 'Missing bearer token.'}
                }
            },
        },
        502: {
            'description': 'Could not reach OpenRouter to perform the check.',
            'content': {
                'application/json': {
                    'example': {
                        'code': 'UPSTREAM_ERROR',
                        'message': 'Unexpected error from upstream service.',
                    }
                }
            },
        },
    },
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
        422: {
            'description': 'No ticket_image part in the multipart form (it\'s '
            'required), or content_length header present and negative/malformed.',
            'content': {
                'application/json': {
                    'example': {
                        'code': 'VALIDATION_ERROR',
                        'message': 'Request validation failed',
                        'detail': [
                            {
                                'type': 'missing',
                                'loc': ['body', 'ticket_image'],
                                'msg': 'Field required',
                                'input': None,
                            }
                        ],
                    }
                }
            },
        },
        400: {
            'description': 'Invalid image file, empty/invalid model name, or the '
            'upstream LLM rejected the request as malformed.',
            'content': {
                'application/json': {
                    'examples': {
                        'invalid_image': {
                            'summary': 'Unreadable image file',
                            'value': {'code': 'BAD_REQUEST', 'message': 'Invalid image file'},
                        },
                        'shared_model_not_free': {
                            'summary': 'Non-free model requested without an own API key',
                            'value': {
                                'code': 'BAD_REQUEST',
                                'message': 'Selected shared model must be a free model.',
                            },
                        },
                        'upstream_bad_request': {
                            'summary': 'OpenRouter/OpenAI rejected the request',
                            'value': {
                                'code': 'BAD_REQUEST',
                                'message': 'Bad request. Please check input format.',
                            },
                        },
                    }
                }
            },
        },
        401: {
            'description': "Missing/invalid sign-in, or (if you supplied your own key) "
            "OpenRouter rejected it. These are the two independent locks in "
            "Swagger's Authorize dialog — see the endpoint description.",
            'content': {
                'application/json': {
                    'examples': {
                        'not_signed_in': {
                            'summary': 'No Supabase access token (main "Authorize" not done)',
                            'value': {'code': 'UNAUTHORIZED', 'message': 'Missing bearer token.'},
                        },
                        'expired_session': {
                            'summary': 'Supabase access token is invalid or expired',
                            'value': {
                                'code': 'UNAUTHORIZED',
                                'message': 'Invalid or expired access token.',
                            },
                        },
                        'bad_openrouter_key': {
                            'summary': 'X-OpenRouter-API-Key was supplied but rejected upstream',
                            'value': {'code': 'UNAUTHORIZED', 'message': 'Invalid API key.'},
                        },
                    }
                }
            },
        },
        403: {
            'description': 'OpenRouter/OpenAI permission denied for the requested model.',
            'content': {
                'application/json': {
                    'example': {'code': 'FORBIDDEN', 'message': 'Permission denied.'}
                }
            },
        },
        408: {
            'description': 'Upstream LLM request timed out.',
            'content': {
                'application/json': {
                    'example': {
                        'code': 'REQUEST_TIMEOUT',
                        'message': 'Request to OpenAI timed out.',
                    }
                }
            },
        },
        413: {
            'description': 'Uploaded file is too large, or exceeds the model context '
            'limit even after adaptive optimization.',
            'content': {
                'application/json': {
                    'examples': {
                        'too_large': {
                            'summary': 'File too large',
                            'value': {
                                'code': 'PAYLOAD_TOO_LARGE',
                                'message': 'Ticket image must be smaller than 25 MB',
                            },
                        },
                        'context_limit': {
                            'summary': 'Context limit exceeded after optimization',
                            'value': {
                                'code': 'PAYLOAD_TOO_LARGE',
                                'message': 'Image could not be optimized to fit context '
                                'limits. Try a smaller or simpler image.',
                            },
                        },
                    }
                }
            },
        },
        415: {
            'description': 'File content does not match an allowed image type '
            '(checked via magic bytes, not just the declared Content-Type).',
            'content': {
                'application/json': {
                    'example': {
                        'code': 'UNSUPPORTED_MEDIA_TYPE',
                        'message': 'Invalid file type: detected text/plain. Only JPEG, '
                        'PNG or WebP allowed.',
                    }
                }
            },
        },
        429: {
            'description': 'One of three independent limits — distinguish by `code`, '
            'not just the 429 status.',
            'content': {
                'application/json': {
                    'examples': {
                        'per_minute_rate_limit': {
                            'summary': 'Too many requests in a short window (SlowAPI, per user/IP)',
                            'value': {
                                'code': 'RATE_LIMIT_MINUTE',
                                'message': 'Too many requests in a short time. Please '
                                'slow down and retry shortly.',
                                'detail': {'limit': '5'},
                            },
                        },
                        'daily_quota_exceeded': {
                            'summary': 'Shared-key daily cap reached (only applies without '
                            'your own X-OpenRouter-API-Key)',
                            'value': {
                                'code': 'QUOTA_DAILY_EXCEEDED',
                                'message': 'Daily free extraction limit reached. Add your '
                                'own OpenRouter API key in settings or try again tomorrow.',
                            },
                        },
                        'upstream_rate_limited': {
                            'summary': 'OpenRouter/OpenAI itself rate-limited the request',
                            'value': {
                                'code': 'RATE_LIMITED',
                                'message': 'Too many requests. Please try again later.',
                            },
                        },
                    }
                }
            },
        },
        500: {
            'description': 'Internal server error, misconfiguration, or upstream '
            'response could not be parsed into MovieMetadata.',
            'content': {
                'application/json': {
                    'examples': {
                        'parse_error': {
                            'summary': 'Response parsing failed',
                            'value': {
                                'code': 'INTERNAL_ERROR',
                                'message': 'Failed to parse movie metadata from response',
                            },
                        },
                        'missing_shared_key': {
                            'summary': 'No X-OpenRouter-API-Key given and no shared key configured',
                            'value': {
                                'code': 'INTERNAL_ERROR',
                                'message': 'OpenRouter API key is missing. Please provide '
                                'it in the header or configure it in the backend settings.',
                            },
                        },
                        'quota_misconfigured': {
                            'summary': 'Backend is missing Supabase quota settings',
                            'value': {
                                'code': 'INTERNAL_ERROR',
                                'message': 'Supabase quota settings are not configured on '
                                'the backend. Set SUPABASE_SECRET_KEY (or legacy '
                                'SUPABASE_SERVICE_ROLE_KEY).',
                            },
                        },
                        'quota_rpc_failed': {
                            'summary': "The quota-check call to Supabase itself failed "
                            "(only when using the shared key — irrelevant with your own "
                            "X-OpenRouter-API-Key)",
                            'value': {
                                'code': 'INTERNAL_ERROR',
                                'message': 'Failed to enforce daily usage limit.',
                            },
                        },
                        'quota_response_unparseable': {
                            'summary': 'Quota-check call succeeded but returned an '
                            'unexpected response shape',
                            'value': {
                                'code': 'INTERNAL_ERROR',
                                'message': 'Unexpected quota service response.',
                            },
                        },
                        'generic': {
                            'summary': 'Unexpected internal error',
                            'value': {
                                'code': 'INTERNAL_ERROR',
                                'message': 'An unexpected error occurred.',
                            },
                        },
                    }
                }
            },
        },
        502: {
            'description': 'Could not reach OpenRouter/OpenAI, or it returned a '
            'non-JSON / invalid response.',
            'content': {
                'application/json': {
                    'examples': {
                        'connection_failure': {
                            'summary': 'Could not connect to the upstream LLM',
                            'value': {
                                'code': 'UPSTREAM_ERROR',
                                'message': 'Unable to connect to OpenAI. Please retry later.',
                            },
                        },
                        'invalid_response': {
                            'summary': 'Model returned a non-JSON / unparseable response',
                            'value': {
                                'code': 'UPSTREAM_ERROR',
                                'message': 'Model returned an invalid/non-JSON response. '
                                'Try a specific free model such as '
                                'qwen/qwen2.5-vl-72b-instruct:free.',
                            },
                        },
                    }
                }
            },
        },
    }
}
