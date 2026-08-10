from config import settings
from fastapi import APIRouter, Request
from rate_limit import limiter
from responses.root import responses
from schemas.root import HealthResponse, RootResponse

router = APIRouter()


@router.get(
    path='/',
    response_model=RootResponse,
    tags=['Root'],
    description='Root endpoint of the API',
    responses=responses['/'],
)
@limiter.exempt
def root(request: Request) -> RootResponse:
    return RootResponse(
        message='Welcome to the Movie Log API! Use the endpoints to extract movie metadata from ticket images.',
        version=settings.api_version,
    )


@router.get(
    path='/health',
    response_model=HealthResponse,
    tags=['Health'],
    description='Health check endpoint to verify API status',
    responses=responses['/health'],
)
@limiter.exempt
def health_check(request: Request) -> HealthResponse:
    return HealthResponse(message='healthy')
