"""Reversible encryption for a user's own LLM provider API keys
(services/llm_keys.py) — deliberately not hashing. A one-way hash can only
verify a value matches; the backend needs the real key back out to
actually call OpenAI/Gemini/OpenRouter on the user's behalf later, so
this has to be reversible, unlike a password.

Fernet (cryptography's authenticated symmetric encryption — AES-128-CBC
+ HMAC, versioned, includes a timestamp) rather than a hand-rolled
AES-GCM call: it's the well-trodden "encrypt a secret at rest, decrypt
it later, one static key" case Fernet exists for, with less room to get
the nonce/IV handling wrong than assembling primitives directly.

LLM_KEY_ENCRYPTION_KEY is a single backend-held secret (config/settings.py)
— fails closed, not open: if it's unset, storing/reading a key raises
rather than ever silently falling back to plaintext.
"""

from config import settings
from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException, status


def _fernet() -> Fernet:
    key = settings.llm_key_encryption_key
    if not key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail='LLM_KEY_ENCRYPTION_KEY is not configured on the backend — '
            'storing/reading provider API keys is unavailable until it is set.',
        )
    return Fernet(key.get_secret_value().encode('utf-8'))


def encrypt(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode('utf-8')).decode('utf-8')


def decrypt(ciphertext: str) -> str:
    try:
        return _fernet().decrypt(ciphertext.encode('utf-8')).decode('utf-8')
    except InvalidToken as exc:
        # Wrong/rotated encryption key, or corrupted data — not a user-
        # facing 4xx, this should never happen against data this same
        # backend wrote.
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail='Stored API key could not be decrypted.',
        ) from exc


def mask_prefix(plaintext: str, visible: int = 8) -> str:
    """The only part of a stored key ever shown to its owner — e.g.
    'sk-proj-' for OpenAI, 'sk-or-v1' for OpenRouter, enough to recognize
    which key it is without exposing anything usable."""

    return plaintext[:visible]
