"""utils/crypto.py — encryption (not hashing, see the module's own
docstring for why that distinction matters) for stored provider API
keys, and the MultiFernet-based rotation added in Iteration 15.
"""

import pytest
from cryptography.fernet import Fernet
from fastapi import HTTPException
from pydantic import SecretStr
from utils import crypto


@pytest.fixture(autouse=True)
def _real_key(patch_settings):
    """crypto.py fails closed if LLM_KEY_ENCRYPTION_KEY is unset — give
    every test in this module a real one regardless of what LOCAL's
    auto-generation already provided, so these tests don't depend on
    that separate mechanism."""

    patch_settings(
        llm_key_encryption_key=SecretStr(Fernet.generate_key().decode()),
        llm_key_encryption_key_previous=(),
    )


def test_encrypt_then_decrypt_round_trips():
    plaintext = 'sk-test-1234567890'
    ciphertext = crypto.encrypt(plaintext)
    assert ciphertext != plaintext
    assert crypto.decrypt(ciphertext) == plaintext


def test_mask_prefix_returns_only_the_first_n_chars():
    assert crypto.mask_prefix('sk-proj-abcdefgh12345', visible=8) == 'sk-proj-'
    assert crypto.mask_prefix('short', visible=8) == 'short'  # shorter than visible — no crash, no padding


def test_decrypt_fails_closed_with_a_500_not_a_silent_none():
    with pytest.raises(HTTPException) as exc_info:
        crypto.decrypt('not-a-real-fernet-token')
    assert exc_info.value.status_code == 500


def test_missing_encryption_key_fails_closed_not_plaintext(patch_settings):
    patch_settings(llm_key_encryption_key=None)
    with pytest.raises(HTTPException) as exc_info:
        crypto.encrypt('sk-should-never-be-stored-plaintext')
    assert exc_info.value.status_code == 500


def test_rotation_multifernet_decrypts_via_the_previous_key(patch_settings):
    """The exact rotation mechanism from Iteration 15: something
    encrypted under an *old* primary key must still decrypt once that
    key moves to LLM_KEY_ENCRYPTION_KEY_PREVIOUS, even though encrypt()
    now uses the new primary."""

    old_key = Fernet.generate_key().decode()
    new_key = Fernet.generate_key().decode()

    # Encrypt under the "old" primary.
    patch_settings(llm_key_encryption_key=SecretStr(old_key), llm_key_encryption_key_previous=())
    ciphertext = crypto.encrypt('sk-rotate-me')

    # Rotate: new primary, old key demoted to "previous".
    patch_settings(llm_key_encryption_key=SecretStr(new_key), llm_key_encryption_key_previous=(old_key,))

    # Still decrypts — MultiFernet tries the new primary first, falls
    # back to the previous key.
    assert crypto.decrypt(ciphertext) == 'sk-rotate-me'

    # A fresh encrypt() now uses the NEW primary — decryptable even after
    # the old key is dropped from _previous entirely.
    new_ciphertext = crypto.encrypt('sk-fresh')
    patch_settings(llm_key_encryption_key_previous=())
    assert crypto.decrypt(new_ciphertext) == 'sk-fresh'


def test_decrypt_fails_once_the_only_key_that_could_decrypt_it_is_dropped(patch_settings):
    """The other side of rotation: if the old key is dropped from
    _previous *before* re-encryption happens, data still under the old
    key becomes genuinely undecryptable — this is why
    rotate_llm_key_encryption.py exists, and why the operational
    procedure says "run it before dropping the old key," not after."""

    old_key = Fernet.generate_key().decode()
    new_key = Fernet.generate_key().decode()

    patch_settings(llm_key_encryption_key=SecretStr(old_key), llm_key_encryption_key_previous=())
    ciphertext = crypto.encrypt('sk-never-rotated')

    # Rotate primary but DON'T carry the old key into _previous — simulates
    # the mistake the documented procedure warns against.
    patch_settings(llm_key_encryption_key=SecretStr(new_key), llm_key_encryption_key_previous=())

    with pytest.raises(HTTPException) as exc_info:
        crypto.decrypt(ciphertext)
    assert exc_info.value.status_code == 500
