"""llm/llm_client.py — the provider registry, the generic client factory,
and the Gemini-specific fallback-target resolution used by opt-in
auto_fallback (see plan.md's Iteration 12/13 design: all three providers
drive through one AsyncOpenAI client varying only base_url/api_key).
"""

import pytest
from llm.llm_client import PROVIDERS, _client_for, _fallback_model_for


def test_only_openrouter_supports_the_shared_key():
    """The one thing the whole "only OpenRouter has a shared key" design
    depends on — OpenAI/Gemini must never accidentally get marked as
    shared-key-eligible."""

    assert PROVIDERS['openrouter'].supports_shared_key is True
    assert PROVIDERS['openai'].supports_shared_key is False
    assert PROVIDERS['gemini'].supports_shared_key is False


def test_gemini_routes_through_its_openai_compatible_endpoint():
    """The live-verified design decision from Iteration 12 — Gemini via
    its OpenAI-compat endpoint, not a native SDK."""

    assert PROVIDERS['gemini'].base_url == 'https://generativelanguage.googleapis.com/v1beta/openai/'


def test_openai_uses_the_sdk_default_base_url():
    assert PROVIDERS['openai'].base_url is None


def test_openrouter_base_url():
    assert PROVIDERS['openrouter'].base_url == 'https://openrouter.ai/api/v1'


def test_client_for_sets_the_right_base_url_per_provider():
    openrouter_client = _client_for('openrouter', 'fake-key')
    assert str(openrouter_client.base_url) == 'https://openrouter.ai/api/v1/'

    gemini_client = _client_for('gemini', 'fake-key')
    assert str(gemini_client.base_url) == 'https://generativelanguage.googleapis.com/v1beta/openai/'

    openai_client = _client_for('openai', 'fake-key')
    assert 'api.openai.com' in str(openai_client.base_url)


@pytest.mark.asyncio
async def test_fallback_model_for_openai_is_the_hardcoded_suggested_default():
    assert await _fallback_model_for('openai') == 'gpt-4o-mini'


@pytest.mark.asyncio
async def test_fallback_model_for_gemini_is_a_self_healing_latest_alias():
    """Deliberately NOT a pinned dated model name — see Iteration 13's
    revised design: Gemini's own -latest aliases already self-heal
    against renames server-side, confirmed live, so this needed no
    snapshot-fetch machinery at all."""

    model = await _fallback_model_for('gemini')
    assert model.endswith('-latest')
