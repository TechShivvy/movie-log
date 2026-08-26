"""Reversible encryption for a user's own LLM provider API keys
(services/llm_keys.py) — deliberately not hashing. A one-way hash can only
verify a value matches; the backend needs the real key back out to
actually call OpenAI/Gemini/OpenRouter on the user's behalf later, so
this has to be reversible, unlike a password.

Fernet (cryptography's authenticated symmetric encryption — AES-128-CBC
+ HMAC, versioned, includes a timestamp) rather than a hand-rolled
AES-GCM call: it's the well-trodden "encrypt a secret at rest, decrypt
it later" case Fernet exists for, with less room to get the nonce/IV
handling wrong than assembling primitives directly. Key *rotation* uses
cryptography's own MultiFernet rather than a hand-rolled key-versioning
scheme: encrypt always uses the primary (first) key, decrypt tries each
configured key in order — exactly the "rotate without breaking
already-encrypted data" case MultiFernet exists for. See
backend/scripts/rotate_llm_key_encryption.py for the actual rotation
procedure (generate a new primary, keep the old one in
LLM_KEY_ENCRYPTION_KEY_PREVIOUS, re-encrypt everything, then drop it).

LLM_KEY_ENCRYPTION_KEY is a backend-held secret (config/settings.py) —
fails closed, not open: if it's unset, storing/reading a key raises
rather than ever silently falling back to plaintext.
"""

from config import settings
from cryptography.fernet import Fernet, InvalidToken, MultiFernet
from fastapi import HTTPException, status


def _multi_fernet() -> MultiFernet:
    key = settings.llm_key_encryption_key
    if not key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail='LLM_KEY_ENCRYPTION_KEY is not configured on the backend — '
            'storing/reading provider API keys is unavailable until it is set.',
        )
    # Primary key first — MultiFernet.encrypt() always uses whichever key
    # is first in this list; every key (primary + previous) is tried in
    # order on decrypt.
    keys = [Fernet(key.get_secret_value().encode('utf-8'))]
    keys.extend(Fernet(k.encode('utf-8')) for k in settings.llm_key_encryption_key_previous)
    return MultiFernet(keys)


def encrypt(plaintext: str) -> str:
    return _multi_fernet().encrypt(plaintext.encode('utf-8')).decode('utf-8')


def decrypt(ciphertext: str) -> str:
    try:
        return _multi_fernet().decrypt(ciphertext.encode('utf-8')).decode('utf-8')
    except InvalidToken as exc:
        # None of the configured keys (primary or previous) could decrypt
        # this — either a genuinely wrong/missing key in
        # LLM_KEY_ENCRYPTION_KEY_PREVIOUS after a rotation, or corrupted
        # data. Not a user-facing 4xx, this should never happen against
        # data this same backend wrote with a key it still has configured.
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail='Stored API key could not be decrypted. If an encryption key was '
            'just rotated, confirm the old key is still listed in '
            'LLM_KEY_ENCRYPTION_KEY_PREVIOUS until re-encryption completes.',
        ) from exc


def mask_prefix(plaintext: str, visible: int = 8) -> str:
    """The only part of a stored key ever shown to its owner — e.g.
    'sk-proj-' for OpenAI, 'sk-or-v1' for OpenRouter, enough to recognize
    which key it is without exposing anything usable."""

    return plaintext[:visible]
