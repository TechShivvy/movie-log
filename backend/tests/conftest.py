"""Shared fixtures for the whole suite.

Integration tests run against the **real linked Supabase project** — see
tests/README.md for why (nearly every real bug this project has found was
only ever caught by live testing, never by reasoning about Python in
isolation). This file wires that up: an in-process ASGI client for the
real app, a throwaway-user factory with guaranteed cleanup, and an
admin-user variant for the handful of admin-gated routes.

Rate limiting is force-disabled for the whole run (env var set *before*
the app is ever imported — config/settings.py resolves it once at import
time) — it isn't the feature under test in nearly any of these, and
per-IP buckets would make anonymous-endpoint tests flaky when run back
to back. This must happen before any `app`/`config` import anywhere,
including transitively, so it's the very first thing this file does.
"""

import os

os.environ.setdefault('RATE_LIMIT_ENABLED', 'false')

import sys
import uuid
from pathlib import Path
from typing import AsyncIterator, Callable, Optional

import httpx
import pytest
import pytest_asyncio

# So `from config import settings`, `from app import app`, etc. resolve
# the same way they do for the running app itself — app/ isn't a
# package relative to backend/, it's the actual import root. Same
# pattern backend/scripts/*.py already use for the same reason.
_APP_DIR = Path(__file__).resolve().parent.parent / 'app'
sys.path.insert(0, str(_APP_DIR))
os.chdir(_APP_DIR)  # config/settings.py's YAML source loads relative to cwd

from app import app as fastapi_app  # noqa: E402
from config import settings  # noqa: E402
from httpx import ASGITransport  # noqa: E402


def _require_env(name: str) -> str:
    """Fetches a required config value from the already-resolved app
    settings, skipping the whole session with a clear message rather
    than failing every test cryptically if the suite is run somewhere
    unconfigured (e.g. no .env at all)."""

    value = getattr(settings, name, None)
    if value is None:
        pytest.skip(f'{name} is not configured — set it in backend/.env to run this suite.')
    return value.get_secret_value() if hasattr(value, 'get_secret_value') else value


def _admin_key() -> str:
    if settings.supabase_secret_key:
        return settings.supabase_secret_key.get_secret_value()
    if settings.supabase_service_role_key:
        return settings.supabase_service_role_key.get_secret_value()
    pytest.skip('Neither SUPABASE_SECRET_KEY nor SUPABASE_SERVICE_ROLE_KEY is configured.')


@pytest.fixture(scope='session', autouse=True)
def _check_env() -> None:
    """Runs once, before anything else — fails fast with a clear message
    if the suite can't possibly work, instead of 40 cryptic individual
    failures."""

    if not settings.supabase_url:
        pytest.skip('SUPABASE_URL is not configured — this suite needs a real linked project.')
    _admin_key()


@pytest_asyncio.fixture
async def client() -> AsyncIterator[httpx.AsyncClient]:
    """In-process ASGI client for the real app — no separate uvicorn
    process, no port to manage, still exercises the real app code and
    real outbound calls to Supabase. Lifespan (which launches 3 headless
    Chromium processes for link extraction) is deliberately NOT
    triggered — too slow/heavy and irrelevant to nearly every test; see
    tests/README.md for what that means link-extraction tests need."""

    transport = ASGITransport(app=fastapi_app)
    async with httpx.AsyncClient(transport=transport, base_url='http://test') as c:
        yield c


class _UserFactory:
    """Creates throwaway Supabase users via the Admin API (sidesteps the
    project's email rate limit — same reasoning as every manual
    verification this whole project has used), tracks every one created
    so the fixture teardown can delete them all, even if a test fails
    partway through and never gets to clean up itself."""

    def __init__(self, http: httpx.AsyncClient, base_url: str, admin_key: str):
        self._http = http
        self._base_url = base_url.rstrip('/')
        self._admin_key = admin_key
        self.created_user_ids: list[str] = []

    async def __call__(self, *, email: Optional[str] = None) -> tuple[str, str]:
        """Returns (user_id, access_token)."""

        email = email or f'pytest-{uuid.uuid4().hex[:16]}@example.com'
        password = 'TestPass123!'
        headers = {
            'apikey': self._admin_key,
            'Authorization': f'Bearer {self._admin_key}',
            'Content-Type': 'application/json',
        }
        create = await self._http.post(
            f'{self._base_url}/auth/v1/admin/users',
            headers=headers,
            json={'email': email, 'password': password, 'email_confirm': True},
        )
        create.raise_for_status()
        user_id = create.json()['id']
        self.created_user_ids.append(user_id)

        token_resp = await self._http.post(
            f'{self._base_url}/auth/v1/token?grant_type=password',
            headers={'apikey': self._admin_key, 'Content-Type': 'application/json'},
            json={'email': email, 'password': password},
        )
        token_resp.raise_for_status()
        return user_id, token_resp.json()['access_token']

    async def cleanup(self) -> None:
        headers = {'apikey': self._admin_key, 'Authorization': f'Bearer {self._admin_key}'}
        for user_id in self.created_user_ids:
            try:
                await self._http.delete(
                    f'{self._base_url}/auth/v1/admin/users/{user_id}', headers=headers,
                )
            except httpx.HTTPError:
                pass  # Best-effort — a leftover throwaway test user is inert clutter, not a correctness problem.


@pytest_asyncio.fixture
async def make_user() -> AsyncIterator[Callable]:
    """Async factory fixture: `user_id, token = await make_user()`.
    Every user created through it is deleted in teardown automatically —
    tests never need to clean up their own throwaway users."""

    admin_key = _admin_key()
    async with httpx.AsyncClient(timeout=15.0) as http:
        factory = _UserFactory(http, settings.supabase_url, admin_key)
        yield factory
        await factory.cleanup()


@pytest_asyncio.fixture
async def admin_user(make_user) -> AsyncIterator[tuple[str, str]]:
    """Like make_user, but the created user's id is temporarily added to
    ADMIN_USER_IDS for the duration of the test — needed for the handful
    of admin-gated routes (report triage, venue lifecycle status).
    Settings is frozen (config/settings.py), so this bypasses that via
    object.__setattr__ — the same technique settings.py's own LOCAL-only
    auto-generated-encryption-key validator already uses for the same
    reason — and always restores the original allowlist in teardown,
    even if the test fails."""

    user_id, token = await make_user()
    original = settings.admin_user_ids
    object.__setattr__(settings, 'admin_user_ids', (*original, user_id))
    try:
        yield user_id, token
    finally:
        object.__setattr__(settings, 'admin_user_ids', original)


def personal_test_key(name: str) -> Optional[str]:
    """Reads a personal test API key (OPENROUTER_API_KEY_1,
    OPENAI_API_KEY_1, GEMINI_API_KEY_1, ...) directly from the process
    environment / .env — these are throwaway keys for live-testing the
    LLM provider paths, never the backend's own shared/paid
    OPENROUTER_API_KEY, which no test ever touches. Returns None (callers
    should skip) if not configured, rather than failing every @pytest.mark.llm
    test with a confusing error."""

    from dotenv import dotenv_values

    value = os.environ.get(name)
    if value:
        return value
    env_path = Path(__file__).resolve().parent.parent / '.env'
    return dotenv_values(env_path).get(name)


@pytest.fixture
def patch_settings() -> Callable:
    """Temporarily overrides fields on the real `settings` object and
    restores every one of them afterward, even on failure.

    Settings is `frozen=True` (config/settings.py) — regular
    `monkeypatch.setattr(settings, ...)` raises `pydantic_core.ValidationError:
    Instance is frozen` (confirmed live), since both setting and
    monkeypatch's own restore go through pydantic's `__setattr__`
    override. This bypasses that via `object.__setattr__`, the same
    technique settings.py's own LOCAL-only auto-generated-encryption-key
    validator and this file's `admin_user` fixture already use for the
    same reason.

    Usage: `patch_settings(llm_key_encryption_key=None)`.
    """

    originals: dict[str, object] = {}

    def _patch(**kwargs) -> None:
        for name, value in kwargs.items():
            if name not in originals:  # only remember the *first* original value
                originals[name] = getattr(settings, name)
            object.__setattr__(settings, name, value)

    yield _patch

    for name, value in originals.items():
        object.__setattr__(settings, name, value)
