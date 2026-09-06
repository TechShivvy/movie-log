"""routers/root.py — /health. FastAPI's APIRoute doesn't auto-add HEAD
alongside GET the way plain Starlette's Route does (confirmed live: a HEAD
request to a GET-only FastAPI route 405s), so HEAD needs its own explicit
registration — this guards that regression.
"""

import pytest


@pytest.mark.asyncio
async def test_health_check_get(client):
    response = await client.get('/health')
    assert response.status_code == 200
    assert response.json() == {'message': 'healthy'}


@pytest.mark.asyncio
async def test_health_check_accepts_head(client):
    """Load balancers / uptime monitors commonly poll health checks with
    HEAD to skip the response body. Same status/headers as GET, empty body."""

    response = await client.head('/health')
    assert response.status_code == 200
    assert response.content == b''
    # Same Content-Length FastAPI would compute for the GET body — proves
    # this actually went through the real health_check logic (JSON
    # serialization included), not some separate no-op HEAD stub.
    assert response.headers.get('content-length') == '21'
