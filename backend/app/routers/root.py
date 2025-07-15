import os

from fastapi import APIRouter
from schemas.root import HealthResponse, RootResponse
from responses.root import responses

router = APIRouter()


@router.get(
    path='/',
    response_model=RootResponse,
    tags=['Root'],
    description='Root endpoint of the API',
    responses=responses['/'],
)
def root() -> RootResponse:
    return RootResponse(
        message='Welcome to the Movie Log API! Use the endpoints to extract movie metadata from ticket images.',
        version=os.environ.get('API_VERSION', 'v1.0.0'),
    )


@router.get(
    path='/health',
    response_model=HealthResponse,
    tags=['Health'],
    description='Health check endpoint to verify API status',
    responses=responses['/health'],
)
def health_check() -> HealthResponse:
    return HealthResponse(message='healthy')
