#! /usr/bin/env python
# -*- coding: utf-8 -*-

'''
This script contains a FastAPI application for that extracts movie metadata from ticket images.
'''

__author__ = 'Shivcharan Thirunavukkarasu'
__date__ = 'Jul 2025'


from contextlib import asynccontextmanager

from config import settings
from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from loguru_setup import LOGGER
from middlewares import middleware
from routers import auth, dev_oauth, follows, movie_logs, movie_metadata, reports, root, venues, public_profile
from services import ticket_link_extractor
from slowapi.middleware import SlowAPIMiddleware
from slowapi.errors import RateLimitExceeded
from starlette.exceptions import HTTPException as StarletteHTTPException
from utils.errors import (
    APIError,
    api_error_handler,
    http_exception_handler,
    rate_limit_handler,
    unhandled_exception_handler,
    validation_exception_handler,
)
from rate_limit import limiter


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # One real Chromium process for the whole app lifetime (see
    # services/ticket_link_extractor.py) — launching a full browser is
    # multiple seconds and too heavy to do inline per request. Fails
    # open, not crashing app startup: link extraction is an optional,
    # best-effort input path alongside ticket-photo upload (which has
    # nothing to do with a browser and must keep working regardless), so
    # a launch failure here (e.g. a host without the sandbox permissions
    # Chromium needs) degrades that one feature — extract_visible_text()
    # already checks for a missing browser and returns a clean error the
    # frontend can fall back on — rather than taking the whole API down.
    try:
        await ticket_link_extractor.init_browser()
    except Exception as exc:
        LOGGER.error(
            'Failed to launch the headless browser for link extraction — '
            'that feature will be unavailable, rest of the app is unaffected: {}',
            exc,
        )
    yield
    await ticket_link_extractor.close_browser()


def create_app() -> FastAPI:
    """
    Create and configure the FastAPI application.

    Returns:
        FastAPI: Configured FastAPI application instance.
    """

    api_prefix = settings.api_prefix

    app = FastAPI(
        lifespan=lifespan,
        title='Movie Log API',
        version=settings.api_version,
        description='API for extracting movie metadata from ticket images.\n\nGitHub: [TechShivvy/movie-log](https://github.com/TechShivvy/movie-log)',
        contact={
            'name': 'Shivcharan Thirunavukkarasu',
            'Github repository': 'https://github.com/TechShivvy/movie-log',
        },
        # Gate Swagger/OpenAPI in production so the schema is not publicly accessible.
        docs_url='/docs' if settings.env != 'PROD' else None,
        redoc_url='/redoc' if settings.env != 'PROD' else None,
        openapi_url='/openapi.json' if settings.env != 'PROD' else None,
        openapi_tags=[
            {
                'name': 'Extract Movie Metadata',
                'description': 'Endpoints for extracting movie metadata from ticket images.',
            },
            {
                'name': 'Movie Logs',
                'description': 'CRUD, export and import for a user\'s saved movie logs. '
                'Requires a Supabase access token (Bearer).',
            },
            {
                'name': 'Auth',
                'description': 'Verify a Supabase access token, inspect the mapped '
                "identity, and delete the caller's own account. Sign-up/sign-in/"
                'password-reset are not here — those go straight from the client to '
                'Supabase Auth, same as Google sign-in.',
            },
            {
                'name': 'Venues',
                'description': 'Theatre/screen directory, their aggregate rating '
                "stats, and their reviews. Directory reads, stats, and reviews are "
                'public; creating theatres/screens, notes, and Google Places search '
                'require sign-in. A theatre\'s `source` marks whether it was '
                "resolved from a real Google Places place_id ('google_places') or "
                "free-typed with no place_id to back it ('user_submitted').",
            },
            {
                'name': 'Public',
                'description': "Public profile search and a user's shared movie logs. "
                'Reads are public and unrestricted by privacy state — search and '
                'profile lookup both work regardless of `account_visibility`. '
                'That field only controls whether GET /users/{username} shows any '
                'logs (non-public accounts show the profile shell only), same as a '
                'private Instagram account. Shown logs are always `public`-visibility '
                "— `anonymous` ones show up on the venue instead (see Venues), never "
                "attributed to their writer's profile.",
            },
            {
                'name': 'Follows',
                'description': 'One-directional follow relationships (not mutual '
                '"friends" — separate followers/following lists) and blocking. '
                'Following a `public` account is instant; `followers_only`/`private` '
                'require the target to accept a pending request. All endpoints '
                'require sign-in.',
            },
            {
                'name': 'Reports',
                'description': 'Flag a review, profile, theatre, or screen for '
                'review — requires sign-in. Triage (list/review/optionally remove '
                'the content) is admin-only, gated by a flat user_id allowlist '
                '(ADMIN_USER_IDS) — no in-app roles/permissions system beyond that.',
            },
        ],
        # Pre-fills Swagger's OAuth2 Authorize dialog (client_id is unused by
        # the dev shim — Supabase's /authorize doesn't have a client_id
        # concept — this just saves typing a placeholder) and forces PKCE on,
        # which routers/dev_oauth.py's token exchange requires.
        swagger_ui_init_oauth={
            'clientId': 'movie-log-swagger-local',
            'usePkceWithAuthorizationCodeGrant': True,
        }
        if settings.env in ('LOCAL', 'DEV')
        else None,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.allowed_origins),
        allow_methods=['*'],
        allow_headers=['*'],
        allow_credentials=True,
    )
    app.middleware('http')(middleware.log_request_info)
    app.middleware('http')(middleware.add_security_headers)
    app.add_middleware(SlowAPIMiddleware)
    app.add_middleware(
        middleware.MaxBodySizeMiddleware,
        max_bytes=int(settings.max_json_body_size * 1024 * 1024),
    )

    app.include_router(root.router)
    app.include_router(auth.router, prefix=f'{api_prefix}/auth')
    if settings.env in ('LOCAL', 'DEV'):
        # Swagger's "Authorize" -> real Google sign-in via Supabase. See
        # routers/dev_oauth.py for why this needs to exist at all. Never
        # registered in PROD (where /docs is disabled anyway).
        app.include_router(dev_oauth.router, prefix=f'{api_prefix}/auth')
    app.include_router(movie_metadata.router, prefix=f'{api_prefix}/movie-metadata')
    app.include_router(movie_logs.router, prefix=f'{api_prefix}/movie-logs')
    app.include_router(venues.router, prefix=f'{api_prefix}/venues')
    app.include_router(public_profile.router, prefix=f'{api_prefix}/public')
    app.include_router(follows.router, prefix=f'{api_prefix}/public')
    app.include_router(reports.router, prefix=f'{api_prefix}/reports')

    app.state.limiter = limiter
    app.add_exception_handler(APIError, api_error_handler)
    app.add_exception_handler(RateLimitExceeded, rate_limit_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)
    return app


def init() -> FastAPI:
    """
    Initialize the FastAPI application.

    Returns:
        FastAPI: Initialized FastAPI application instance.
    """

    app = create_app()
    return app


app = init()
