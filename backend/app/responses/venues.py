"""Example request/response bodies for routers/venues.py.

Keyed by operation (function name), since /theatres/{theatre_id}/screens
serves both GET (list_screens) and POST (create_screen).
"""

_THEATRE_EXAMPLE = {
    'id': '22222222-2222-2222-2222-222222222222',
    'name': 'PVR Nexus',
    'chain': 'PVR',
    'city': 'Chennai',
    'state': 'Tamil Nadu',
    'country': 'IN',
    'lat': 13.0605,
    'lng': 80.2087,
    'place_id': 'ChIJ_______example_______',
    'formatted_address': 'Nexus Mall, Vadapalani, Chennai, Tamil Nadu 600026',
    'source': 'google_places',
    'status': 'open',
}

_SCREEN_EXAMPLE = {
    'id': '33333333-3333-3333-3333-333333333333',
    'theatre_id': _THEATRE_EXAMPLE['id'],
    'name': 'Screen 4 - IMAX',
    'screen_type': 'IMAX',
    'status': 'open',
}

_THEATRE_NOTE_EXAMPLE = {
    'id': '44444444-4444-4444-4444-444444444444',
    'user_id': '11111111-1111-1111-1111-111111111111',
    'theatre_id': _THEATRE_EXAMPLE['id'],
    'screen_id': None,
    'note': 'Parking fills up fast on weekends — arrive 30 min early.',
    'created_at': '2026-08-11T03:30:16.719405+00:00',
    'updated_at': '2026-08-11T03:30:16.719405+00:00',
}

_SCREEN_NOTE_EXAMPLE = {
    'id': '55555555-5555-5555-5555-555555555555',
    'user_id': '11111111-1111-1111-1111-111111111111',
    'theatre_id': None,
    'screen_id': _SCREEN_EXAMPLE['id'],
    'note': 'Always ask for row H — best sightline, less neck strain.',
    'created_at': '2026-08-11T03:30:16.719405+00:00',
    'updated_at': '2026-08-11T03:30:16.719405+00:00',
}

# One attributed (visibility='public') and one not (visibility='anonymous')
# — user_id/username are null on the second one, not omitted, so clients
# can tell "no one set a username" apart from "this is anonymous" isn't a
# concern here: both null the same way, which is intentional (see the view
# definition, migration 20260810000001) — an anonymous review reveals
# nothing about who wrote it, not even indirectly via a missing-vs-null
# distinction. No price/currency here either, same as the public profile's
# movie-log example — personal financial detail stays out of this view
# entirely (migration 20260811000008), format doesn't.
_REVIEW_EXAMPLES = [
    {
        'id': '3fa85f64-5717-4562-b3fc-2c963f66afa6',
        'user_id': '11111111-1111-1111-1111-111111111111',
        'username': 'shivco_2141',
        'movie': 'Ekkadiki Pothavu Chinnavada',
        'watched_date': '2016-12-19',
        'watched_time': '21:30',
        'timezone_abbrv': 'IST',
        'theater': 'Sri Rama Picture Place: Vizag',
        'theatre_id': _THEATRE_EXAMPLE['id'],
        'language': 'Telugu',
        'screen': 'Balcony',
        'screen_id': _SCREEN_EXAMPLE['id'],
        'format': '2D',
        'certificate': 'U/A',
        'notes': 'Great sound, comfy seats.',
        'rating': 4.5,
        'created_at': '2026-08-10T03:30:16.719405+00:00',
    },
    {
        'id': '62f5eb84-9427-42ad-ba6e-ac5609f545ae',
        'user_id': None,
        'username': None,
        'movie': 'Ekkadiki Pothavu Chinnavada',
        'watched_date': '2016-12-20',
        'watched_time': None,
        'timezone_abbrv': None,
        'theater': 'Sri Rama Picture Place: Vizag',
        'theatre_id': _THEATRE_EXAMPLE['id'],
        'language': 'Telugu',
        'screen': None,
        'screen_id': None,
        'format': None,
        'certificate': None,
        'notes': "Wouldn't go again, AC was broken.",
        'rating': 2.0,
        'created_at': '2026-08-10T05:12:03.112009+00:00',
    },
]

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

_VALIDATION = {
    422: {
        'description': 'Request body failed schema validation.',
        'content': {
            'application/json': {
                'example': {
                    'code': 'VALIDATION_ERROR',
                    'message': 'Request validation failed',
                    'detail': [
                        {
                            'type': 'string_too_short',
                            'loc': ['body', 'query'],
                            'msg': 'String should have at least 2 characters',
                            'input': 'P',
                        }
                    ],
                }
            }
        },
    }
}

# FastAPI documents a 422 by default on every endpoint that has *any*
# request parameter, even a plain `str` path param that can't actually fail
# type coercion. Kept here (rather than omitted) so the response envelope
# shown matches reality — {code, message, detail} via
# utils/errors.py:validation_exception_handler — instead of FastAPI's
# default HTTPValidationError shape ({"detail": [...]}), which is not what
# this API actually returns.
_VALIDATION_UNLIKELY = {
    422: {
        'description': "Present for completeness — this endpoint's only "
        'parameter is a plain string, so this is not realistically reachable.',
        'content': {
            'application/json': {
                'example': {
                    'code': 'VALIDATION_ERROR',
                    'message': 'Request validation failed',
                    'detail': [],
                }
            }
        },
    }
}

# Every endpoint here calls services/supabase_rest.py, which forwards to
# PostgREST/Supabase and re-raises non-2xx responses as APIError — these
# are possible on every operation below, authenticated or not (the public
# stats endpoints go through the anon key instead of a user token, but the
# same error-mapping code path applies).
_UPSTREAM = {
    403: {
        'description': "Row Level Security denied the operation. Shouldn't happen "
        'through normal use of this API, but is a real possible response if RLS '
        'policies ever diverge from what the backend assumes.',
        'content': {
            'application/json': {
                'example': {
                    'code': 'FORBIDDEN',
                    'message': 'You do not have access to this resource.',
                }
            }
        },
    },
    500: {
        'description': 'Backend is missing required Supabase configuration '
        '(SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY).',
        'content': {
            'application/json': {
                'example': {
                    'code': 'CONFIG_ERROR',
                    'message': 'Supabase URL is not configured on the backend.',
                }
            }
        },
    },
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
    'match_theatres': {
        200: {
            'description': "Candidate theatres ranked by name similarity — a "
            '"did you mean" prompt, not an auto-merge. Empty list means no close '
            'match; the client should offer "create new theatre" instead.',
            'content': {
                'application/json': {
                    'example': [
                        {
                            'id': _THEATRE_EXAMPLE['id'],
                            'name': _THEATRE_EXAMPLE['name'],
                            'chain': _THEATRE_EXAMPLE['chain'],
                            'city': _THEATRE_EXAMPLE['city'],
                            'formatted_address': _THEATRE_EXAMPLE['formatted_address'],
                            'similarity': 0.87,
                        }
                    ]
                }
            },
        },
        **_UNAUTHORIZED,
        **_VALIDATION,
        **_UPSTREAM,
    },
    'search_places': {
        200: {
            'description': 'Place suggestions from Google Places, restricted to '
            'movie theatres. Empty list means no match on Google\'s side either — '
            'the client should offer a free-typed fallback (POST /theatres without '
            'place_id).',
            'content': {
                'application/json': {
                    'example': [
                        {
                            'place_id': _THEATRE_EXAMPLE['place_id'],
                            'description': 'PVR Nexus, Vadapalani, Chennai, Tamil Nadu, India',
                            'main_text': 'PVR Nexus',
                            'secondary_text': 'Vadapalani, Chennai, Tamil Nadu, India',
                        }
                    ]
                }
            },
        },
        500: {
            'description': 'No Google Places API key configured on the backend — a '
            'valid, supported state, see POST /theatres.',
            'content': {
                'application/json': {
                    'example': {
                        'code': 'CONFIG_ERROR',
                        'message': 'Google Places API key is not configured on the backend.',
                    }
                }
            },
        },
        502: {
            'description': 'Google Places is unreachable, timed out, or returned an '
            'error.',
            'content': {
                'application/json': {
                    'example': {
                        'code': 'UPSTREAM_ERROR',
                        'message': 'Google Places request failed.',
                    }
                }
            },
        },
        **_UNAUTHORIZED,
        **_VALIDATION,
    },
    'create_theatre': {
        201: {
            'description': 'The created theatre — or an existing one, unchanged, if '
            'place_id already matched one (place_id is the real dedup key; the '
            '/theatres/match endpoint above is only ever a UI prompt, never used '
            'for auto-merging).',
            'content': {'application/json': {'example': _THEATRE_EXAMPLE}},
        },
        **_UNAUTHORIZED,
        **_VALIDATION,
        **_UPSTREAM,
    },
    'set_theatre_status': {
        200: {
            'description': 'The updated theatre.',
            'content': {
                'application/json': {
                    'example': {**_THEATRE_EXAMPLE, 'status': 'closed'},
                }
            },
        },
        403: {
            'description': "Caller isn't in ADMIN_USER_IDS.",
            'content': {
                'application/json': {
                    'example': {
                        'code': 'FORBIDDEN',
                        'message': 'This action requires admin access.',
                    }
                }
            },
        },
        404: {
            'description': 'No theatre with this id.',
            'content': {
                'application/json': {
                    'example': {'code': 'NOT_FOUND', 'message': 'Theatre not found.'}
                }
            },
        },
        **_UNAUTHORIZED,
        **_VALIDATION,
        **_UPSTREAM,
    },
    'match_screens': {
        200: {
            'description': 'Candidate screens at this theatre ranked by name '
            'similarity — a "did you mean" prompt, not an auto-merge. Empty list '
            'means no close match; the client should offer "create new screen" '
            'instead.',
            'content': {
                'application/json': {
                    'example': [
                        {
                            'id': _SCREEN_EXAMPLE['id'],
                            'name': _SCREEN_EXAMPLE['name'],
                            'screen_type': _SCREEN_EXAMPLE['screen_type'],
                            'similarity': 0.83,
                        }
                    ]
                }
            },
        },
        **_UNAUTHORIZED,
        **_VALIDATION,
        **_UPSTREAM,
    },
    'list_screens': {
        200: {
            'description': 'All screens for this theatre.',
            'content': {'application/json': {'example': [_SCREEN_EXAMPLE]}},
        },
        **_UNAUTHORIZED,
        **_VALIDATION_UNLIKELY,
        **_UPSTREAM,
    },
    'create_screen': {
        201: {
            'description': 'The created screen.',
            'content': {'application/json': {'example': _SCREEN_EXAMPLE}},
        },
        400: {
            'description': "theatre_id doesn't reference an existing theatre, or "
            'this theatre already has a screen with the same name (unique per '
            'theatre, not globally).',
            'content': {
                'application/json': {
                    'examples': {
                        'invalid_theatre_id': {
                            'summary': "theatre_id doesn't reference an existing theatre",
                            'value': {
                                'code': 'BAD_REQUEST',
                                'message': 'The request could not be processed.',
                            },
                        },
                        'duplicate_screen_name': {
                            'summary': 'A screen with this name already exists at '
                            'this theatre',
                            'value': {
                                'code': 'BAD_REQUEST',
                                'message': 'The request could not be processed.',
                            },
                        },
                    }
                }
            },
        },
        **_UNAUTHORIZED,
        **_VALIDATION,
        **_UPSTREAM,
    },
    'set_screen_status': {
        200: {
            'description': 'The updated screen.',
            'content': {
                'application/json': {
                    'example': {**_SCREEN_EXAMPLE, 'status': 'renovation'},
                }
            },
        },
        403: {
            'description': "Caller isn't in ADMIN_USER_IDS.",
            'content': {
                'application/json': {
                    'example': {
                        'code': 'FORBIDDEN',
                        'message': 'This action requires admin access.',
                    }
                }
            },
        },
        404: {
            'description': 'No screen with this id.',
            'content': {
                'application/json': {
                    'example': {'code': 'NOT_FOUND', 'message': 'Screen not found.'}
                }
            },
        },
        **_UNAUTHORIZED,
        **_VALIDATION,
        **_UPSTREAM,
    },
    'theatre_stats': {
        200: {
            'description': 'Aggregate ratings across every screen at this theatre. '
            '`overall_avg` is a single headline number — the mean of whichever of '
            'the 4 categories in `overall` have data, visit-weighted (every visit '
            "counts once, regardless of which screen it was on). `screens_avg` is a "
            "second, deliberately different number: the mean of this theatre's own "
            "screens' own overall_avg, one vote per screen regardless of visit "
            'count — use it to show whether screens here are consistent with each '
            'other, separate from the visit-weighted headline. Either can be null '
            "if nothing feeds it yet (e.g. ratings exist but aren't tied to any "
            'screen). Public — no auth required. Kept fresh by a database trigger '
            'on every venue-rating change, not computed on read.',
            'content': {
                'application/json': {
                    'example': {
                        'theatre_id': _THEATRE_EXAMPLE['id'],
                        'overall': {
                            'screen_rating': {'avg': 4.5, 'count': 12},
                            'speaker_rating': {'avg': 4.7, 'count': 12},
                            'ac_rating': {'avg': 3.9, 'count': 10},
                            'seat_rating': {'avg': 4.1, 'count': 11},
                        },
                        'overall_avg': 4.3,
                        'screens_avg': 4.2,
                        'computed_at': '2026-08-10T03:31:15.977764+00:00',
                        'punctuality': {
                            'on_time_count': 5,
                            'early_count': 1,
                            'delayed_count': 3,
                            'cancelled_count': 0,
                            'avg_delay_minutes': 12.3,
                            'total_count': 9,
                        },
                    }
                }
            },
        },
        404: {
            'description': "No stats yet at all — either the theatre doesn't exist, "
            "or it does but has no venue ratings and no punctuality data yet. "
            "(Both look the same here; if you need to tell them apart, check "
            "GET /theatres/{id}/screens instead.)",
            'content': {
                'application/json': {
                    'example': {
                        'code': 'NOT_FOUND',
                        'message': 'No stats for this theatre yet.',
                    }
                }
            },
        },
        **_VALIDATION_UNLIKELY,
        **_UPSTREAM,
    },
    'screen_stats': {
        200: {
            'description': 'Aggregate ratings for this specific screen. '
            '`overall_avg` is a single headline number — the mean of whichever of '
            "the 4 categories in `categories` have data. This is what feeds a "
            "theatre's `screens_avg` (see GET /theatres/{id}/stats). Public — no "
            'auth required.',
            'content': {
                'application/json': {
                    'example': {
                        'screen_id': _SCREEN_EXAMPLE['id'],
                        'categories': {
                            'screen_rating': {'avg': 4.5, 'count': 6},
                            'speaker_rating': {'avg': 5.0, 'count': 6},
                            'ac_rating': {'avg': 3.5, 'count': 5},
                            'seat_rating': {'avg': 4.0, 'count': 6},
                        },
                        'overall_avg': 4.3,
                        'computed_at': '2026-08-10T03:31:15.977764+00:00',
                        'punctuality': {
                            'on_time_count': 3,
                            'early_count': 0,
                            'delayed_count': 2,
                            'cancelled_count': 0,
                            'avg_delay_minutes': 8.5,
                            'total_count': 5,
                        },
                    }
                }
            },
        },
        404: {
            'description': "No stats yet at all — either the screen doesn't exist, "
            'or it does but has no venue ratings and no punctuality data yet.',
            'content': {
                'application/json': {
                    'example': {
                        'code': 'NOT_FOUND',
                        'message': 'No stats for this screen yet.',
                    }
                }
            },
        },
        **_VALIDATION_UNLIKELY,
        **_UPSTREAM,
    },
    'theatre_reviews': {
        200: {
            'description': 'Public and anonymous reviews for this theatre, newest '
            "first. Empty list for an unknown theatre_id or one with no reviews yet "
            "— unlike the stats endpoint above, there's nothing to 404 on here.",
            'content': {'application/json': {'example': _REVIEW_EXAMPLES}},
        },
        **_VALIDATION,
        **_UPSTREAM,
    },
    'screen_reviews': {
        200: {
            'description': 'Public and anonymous reviews for this screen, newest '
            'first.',
            'content': {
                'application/json': {
                    'example': [
                        {**r, 'screen_id': _SCREEN_EXAMPLE['id']} for r in _REVIEW_EXAMPLES
                    ]
                }
            },
        },
        **_VALIDATION,
        **_UPSTREAM,
    },
    'get_theatre_note': {
        200: {
            'description': "The caller's private note for this theatre.",
            'content': {'application/json': {'example': _THEATRE_NOTE_EXAMPLE}},
        },
        404: {
            'description': 'No note saved for this theatre yet.',
            'content': {
                'application/json': {
                    'example': {'code': 'NOT_FOUND', 'message': 'No note for this theatre yet.'}
                }
            },
        },
        **_UNAUTHORIZED,
        **_VALIDATION_UNLIKELY,
        **_UPSTREAM,
    },
    'set_theatre_note': {
        200: {
            'description': 'The saved note, created or overwritten.',
            'content': {'application/json': {'example': _THEATRE_NOTE_EXAMPLE}},
        },
        **_UNAUTHORIZED,
        **_VALIDATION,
        **_UPSTREAM,
    },
    'delete_theatre_note': {
        204: {'description': 'Deleted — no response body.'},
        404: {
            'description': 'No note saved for this theatre yet.',
            'content': {
                'application/json': {
                    'example': {'code': 'NOT_FOUND', 'message': 'No note for this theatre yet.'}
                }
            },
        },
        **_UNAUTHORIZED,
        **_VALIDATION_UNLIKELY,
        **_UPSTREAM,
    },
    'get_screen_note': {
        200: {
            'description': "The caller's private note for this screen.",
            'content': {'application/json': {'example': _SCREEN_NOTE_EXAMPLE}},
        },
        404: {
            'description': 'No note saved for this screen yet.',
            'content': {
                'application/json': {
                    'example': {'code': 'NOT_FOUND', 'message': 'No note for this screen yet.'}
                }
            },
        },
        **_UNAUTHORIZED,
        **_VALIDATION_UNLIKELY,
        **_UPSTREAM,
    },
    'set_screen_note': {
        200: {
            'description': 'The saved note, created or overwritten.',
            'content': {'application/json': {'example': _SCREEN_NOTE_EXAMPLE}},
        },
        **_UNAUTHORIZED,
        **_VALIDATION,
        **_UPSTREAM,
    },
    'delete_screen_note': {
        204: {'description': 'Deleted — no response body.'},
        404: {
            'description': 'No note saved for this screen yet.',
            'content': {
                'application/json': {
                    'example': {'code': 'NOT_FOUND', 'message': 'No note for this screen yet.'}
                }
            },
        },
        **_UNAUTHORIZED,
        **_VALIDATION_UNLIKELY,
        **_UPSTREAM,
    },
}
