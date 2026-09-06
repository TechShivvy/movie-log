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
# Load balancers / uptime monitors (Render, k8s liveness probes, UptimeRobot,
# ...) commonly poll health checks with HEAD instead of GET to skip the
# response body entirely. Unlike plain Starlette (whose Route always adds
# HEAD automatically alongside GET), FastAPI's APIRoute does not -- it sets
# route.methods from exactly what's passed in, with no such fallback
# (confirmed live: a HEAD request to a GET-only FastAPI route 405s, it does
# not silently fall through to the GET handler) -- so HEAD needs its own
# explicit registration. include_in_schema=False: same operation as the GET
# above, not a second documented endpoint.
@router.head(
    path='/health',
    response_model=HealthResponse,
    include_in_schema=False,
)
@limiter.exempt
def health_check(request: Request) -> HealthResponse:
    return HealthResponse(message='healthy')
