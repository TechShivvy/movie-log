"""Example request/response bodies for routers/movie_metadata_batch.py."""

_BATCH_EXAMPLE = {
    'id': '99999999-9999-9999-9999-999999999999',
    'status': 'completed',
    'provider': 'openrouter',
    'model': 'qwen/qwen2.5-vl-72b-instruct:free',
    'auto_fallback': False,
    'auto_insert': False,
    'total_items': 2,
    'completed_items': 2,
    'failed_items': 0,
    'error_code': None,
    'error_message': None,
    'created_at': '2026-08-17T04:00:00+00:00',
    'finished_at': '2026-08-17T04:00:45+00:00',
    'items': [
        {
            'id': '88888888-8888-8888-8888-888888888881',
            'position': 0,
            'filename': 'ticket1.jpg',
            'status': 'completed',
            'result': {'movie': 'Nexus', 'date': '2026-08-10'},
            'error_code': None,
            'error_message': None,
            'auto_insert_status': None,
            'movie_log_id': None,
        },
        {
            'id': '88888888-8888-8888-8888-888888888882',
            'position': 1,
            'filename': 'ticket2.jpg',
            'status': 'failed',
            'result': None,
            'error_code': '415',
            'error_message': 'Invalid file type: detected text/plain.',
            'auto_insert_status': None,
            'movie_log_id': None,
        },
    ],
}

_CREATE_EXAMPLE = {'id': _BATCH_EXAMPLE['id'], 'status': 'processing', 'total_items': 2}

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

_UPSTREAM = {
    502: {
        'description': 'Database or provider service is unavailable.',
        'content': {
            'application/json': {
                'example': {'code': 'UPSTREAM_ERROR', 'message': 'The request could not be processed.'}
            }
        },
    },
}

responses = {
    'create_batch': {
        202: {
            'description': 'The batch, created and processing in the background.',
            'content': {'application/json': {'example': _CREATE_EXAMPLE}},
        },
        400: {
            'description': 'No images given, more than max_batch_size given, or the '
            'resolved provider has no usable key at all (checked before any batch/item '
            'row is created).',
            'content': {
                'application/json': {
                    'examples': {
                        'too_large': {
                            'summary': 'Batch too large',
                            'value': {
                                'code': 'BATCH_TOO_LARGE',
                                'message': 'A batch accepts at most 20 images (35 given) — '
                                'submit the rest as a second batch.',
                            },
                        },
                        'no_key': {
                            'summary': 'No usable key for the resolved provider',
                            'value': {
                                'code': 'BAD_REQUEST',
                                'message': 'Gemini requires your own API key — there is no '
                                'shared key for this provider. Provide one via the '
                                'X-LLM-API-Key header.',
                            },
                        },
                    }
                }
            },
        },
        429: {
            'description': 'Batch-creation rate limit hit (tighter than the single '
            '/extract limit — one call can enqueue many background LLM calls).',
            'content': {
                'application/json': {
                    'example': {
                        'code': 'RATE_LIMIT_MINUTE',
                        'message': 'Too many requests in a short time. Please slow down and retry shortly.',
                    }
                }
            },
        },
        **_UNAUTHORIZED,
        **_UPSTREAM,
    },
    'get_batch': {
        200: {
            'description': "The batch and all of its items.",
            'content': {'application/json': {'example': _BATCH_EXAMPLE}},
        },
        404: {
            'description': "No batch with this id, or it belongs to someone else.",
            'content': {
                'application/json': {
                    'example': {'code': 'NOT_FOUND', 'message': 'Extraction batch not found.'}
                }
            },
        },
        **_UNAUTHORIZED,
        **_UPSTREAM,
    },
    'list_batches': {
        200: {
            'description': "The caller's batches, newest first.",
            'content': {'application/json': {'example': [{**_BATCH_EXAMPLE, 'items': []}]}},
        },
        **_UNAUTHORIZED,
        **_UPSTREAM,
    },
}
