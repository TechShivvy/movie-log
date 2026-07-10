#! /usr/bin/env python
# -*- coding: utf-8 -*-

'''
This script contains a FastAPI application for that extracts movie metadata from ticket images.
'''

__author__ = 'Shivcharan Thirunavukkarasu'
__date__ = 'Jul 2025'


from config import settings
from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from middlewares import middleware
from routers import auth, movie_logs, movie_metadata, root
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


def create_app() -> FastAPI:
    """
    Create and configure the FastAPI application.

    Returns:
        FastAPI: Configured FastAPI application instance.
    """

    api_prefix = settings.api_prefix

    app = FastAPI(
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
                'description': 'Verify a Supabase access token and inspect the mapped identity.',
            },
        ],
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

    app.include_router(root.router)
    app.include_router(auth.router, prefix=f'{api_prefix}/auth')
    app.include_router(movie_metadata.router, prefix=f'{api_prefix}/movie-metadata')
    app.include_router(movie_logs.router, prefix=f'{api_prefix}/movie-logs')

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
