"""schemas/public_profile.py — LlmPreferenceUpdate, LlmKeyInput/LlmKey,
LlmKeyStorageOptInUpdate (Iterations 12-15), and the pre-existing
profile/privacy/username validators.
"""

import pytest
from pydantic import ValidationError
from schemas.public_profile import (
    AccountPrivacyUpdate,
    LlmKeyInput,
    LlmKeyStorageOptInUpdate,
    LlmPreferenceUpdate,
    ProfileLink,
    UsernameUpdate,
)


class TestLlmPreferenceUpdate:
    def test_provider_and_model_both_required(self):
        with pytest.raises(ValidationError):
            LlmPreferenceUpdate(provider='gemini')  # model missing
        with pytest.raises(ValidationError):
            LlmPreferenceUpdate(model='gemini-flash-latest')  # provider missing

    def test_valid_pair_accepted(self):
        pref = LlmPreferenceUpdate(provider='gemini', model='gemini-flash-latest')
        assert pref.provider == 'gemini'

    def test_invalid_provider_rejected(self):
        with pytest.raises(ValidationError):
            LlmPreferenceUpdate(provider='anthropic', model='claude')


class TestLlmKeyInput:
    def test_empty_key_rejected(self):
        with pytest.raises(ValidationError):
            LlmKeyInput(api_key='')

    def test_nonempty_key_accepted(self):
        assert LlmKeyInput(api_key='sk-real-looking-key').api_key == 'sk-real-looking-key'


class TestLlmKeyStorageOptInUpdate:
    def test_requires_a_real_boolean(self):
        with pytest.raises(ValidationError):
            LlmKeyStorageOptInUpdate(store_on_server='yes please')

    def test_true_and_false_both_accepted(self):
        assert LlmKeyStorageOptInUpdate(store_on_server=True).store_on_server is True
        assert LlmKeyStorageOptInUpdate(store_on_server=False).store_on_server is False


class TestAccountPrivacyUpdate:
    def test_accepts_all_three_tiers(self):
        for tier in ('public', 'followers_only', 'private'):
            assert AccountPrivacyUpdate(account_visibility=tier).account_visibility == tier

    def test_rejects_a_fourth_value(self):
        with pytest.raises(ValidationError):
            AccountPrivacyUpdate(account_visibility='friends_only')


class TestUsernameUpdate:
    def test_rejects_uppercase(self):
        with pytest.raises(ValidationError):
            UsernameUpdate(username='ShivCo')

    def test_rejects_too_short(self):
        with pytest.raises(ValidationError):
            UsernameUpdate(username='ab')

    def test_accepts_lowercase_digits_underscore(self):
        assert UsernameUpdate(username='shivco_2141').username == 'shivco_2141'


class TestProfileLink:
    def test_requires_http_or_https_scheme(self):
        with pytest.raises(ValidationError):
            ProfileLink(label='Sketchy', url='javascript:alert(1)')

    def test_accepts_a_real_link(self):
        link = ProfileLink(label='Letterboxd', url='https://letterboxd.com/shivco')
        assert link.url == 'https://letterboxd.com/shivco'
