from config import settings
from fastapi import APIRouter
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
def root() -> RootResponse:
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
def health_check() -> HealthResponse:
    return HealthResponse(message='healthy')
