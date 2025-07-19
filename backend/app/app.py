#! /usr/bin/env python
# -*- coding: utf-8 -*-

'''
This script contains a FastAPI application for that extracts movie metadata from ticket images.
'''

__author__ = 'Shivcharan Thirunavukkarasu'
__date__ = 'Jul 2025'


from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from middlewares import middleware
from routers import movie_metadata, root
from config import settings


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

    app.include_router(root.router)
    app.include_router(movie_metadata.router, prefix=f'{api_prefix}/movie-metadata')

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
