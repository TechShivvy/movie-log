#! /usr/bin/env python
# -*- coding: utf-8 -*-

'''
This script contains a FastAPI application for that extracts movie metadata from ticket images.
'''

__author__ = 'Shivcharan Thirunavukkarasu'
__date__ = 'Jul 2025'


from config import settings
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from middlewares import middleware
from routers import movie_metadata, root
from slowapi.middleware import SlowAPIMiddleware
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler
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
        openapi_tags=[
            {
                'name': 'Extract Movie Metadata',
                'description': 'Endpoints for extracting movie metadata from ticket images.',
            },
        ],
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=['*'],
        allow_methods=['*'],
        allow_headers=['*'],
        allow_credentials=True,
    )
    app.middleware('http')(middleware.log_request_info)
    app.add_middleware(SlowAPIMiddleware)

    app.include_router(root.router)
    app.include_router(movie_metadata.router, prefix=f'{api_prefix}/movie-metadata')

    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
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
