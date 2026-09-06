#!/usr/bin/env python
"""Re-encrypts every stored user_llm_keys row under the current *primary*
LLM_KEY_ENCRYPTION_KEY (utils/crypto.py's encrypt() always uses whichever
key is listed there — see that module's MultiFernet docstring).

The actual rotation procedure:
  1. Generate a new key:
       python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
  2. Set it as the new LLM_KEY_ENCRYPTION_KEY, and move the *old* value
     into LLM_KEY_ENCRYPTION_KEY_PREVIOUS (comma-separated if rotating
     more than once before a full re-encryption completes). Restart the
     backend so both take effect — decryption now tries the new key
     first, then falls back through the previous ones; encryption
     (including this script's re-encryption writes) always uses the new
     one.
  3. Run this script. Every row gets read, decrypted (via whichever key
     — new or previous — actually wrote it), and re-encrypted under the
     new primary only if it wasn't already.
  4. Once this reports zero rows still needing rotation, remove the old
     key from LLM_KEY_ENCRYPTION_KEY_PREVIOUS entirely and restart again
     — keeping a retired key configured indefinitely defeats the point
     of rotating away from it.

Uses the backend's own secret key, same privileged-access pattern
services/quota.py, services/extraction_cache.py, and services/
llm_keys.py itself already use — never a user's own token, this table
has zero PostgREST grants at all.

Usage:
    python scripts/rotate_llm_key_encryption.py
    python scripts/rotate_llm_key_encryption.py --dry-run
"""

import argparse
import os
import sys

import requests

# So this can import the app's real crypto/settings modules and use the
# exact same MultiFernet logic the running app does — never hand-rolled
# or duplicated here, which would just reintroduce the same "two places
# to keep in sync" risk MultiFernet was adopted to avoid in the first
# place.
_APP_DIR = os.path.join(os.path.dirname(__file__), '..', 'app')
sys.path.insert(0, _APP_DIR)
# config/settings.py loads config.yaml relative to the process's cwd, not
# just sys.path (same quirk scripts/prune_extraction_cache.py already
# works around for the same reason).
os.chdir(_APP_DIR)


def _load_env() -> dict:
    env_path = os.path.join(os.path.dirname(__file__), '..', '.env')
    values: dict = {}
    if os.path.exists(env_path):
        with open(env_path, encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#') or '=' not in line:
                    continue
                k, _, v = line.partition('=')
                values[k.strip()] = v.strip()
    return values


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        '--dry-run', action='store_true',
        help='Report how many rows would be re-encrypted, without writing anything.',
    )
    args = parser.parse_args()

    from config import settings
    from cryptography.fernet import Fernet, InvalidToken
    from utils import crypto

    if not settings.llm_key_encryption_key:
        print('LLM_KEY_ENCRYPTION_KEY is not configured — nothing to rotate to.', file=sys.stderr)
        sys.exit(1)

    # A single-key Fernet (primary only, no MultiFernet fallback) — used
    # purely to *check* whether a row is already under the primary,
    # without needing to write anything if it already is.
    primary_only = Fernet(settings.llm_key_encryption_key.get_secret_value().encode('utf-8'))

    env = _load_env()
    supabase_url = os.environ.get('SUPABASE_URL') or env.get('SUPABASE_URL')
    key = (
        os.environ.get('SUPABASE_SECRET_KEY')
        or env.get('SUPABASE_SECRET_KEY')
        or os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
        or env.get('SUPABASE_SERVICE_ROLE_KEY')
    )
    if not supabase_url or not key:
        print('Set SUPABASE_URL and SUPABASE_SECRET_KEY (or have them in backend/.env).', file=sys.stderr)
        sys.exit(1)

    headers = {'apikey': key, 'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'}
    base = f"{supabase_url.rstrip('/')}/rest/v1/user_llm_keys"

    response = requests.get(
        base, headers=headers, params={'select': 'user_id,provider,encrypted_key'}, timeout=15,
    )
    if response.status_code >= 400:
        print(f'Fetch failed: {response.status_code} {response.text}', file=sys.stderr)
        sys.exit(1)

    rows = response.json()
    already_current = 0
    rotated = 0
    failed = 0

    for row in rows:
        try:
            primary_only.decrypt(row['encrypted_key'].encode('utf-8'))
            already_current += 1
            continue
        except InvalidToken:
            pass  # Not under the primary key yet — needs rotating.

        try:
            plaintext = crypto.decrypt(row['encrypted_key'])
        except Exception as exc:  # noqa: BLE001 — report and move on, don't abort the whole run
            print(
                f"Could not decrypt {row['provider']} for user {row['user_id']} with any "
                f'configured key (primary or previous) — is it actually configured? {exc}',
                file=sys.stderr,
            )
            failed += 1
            continue

        if args.dry_run:
            rotated += 1
            continue

        new_ciphertext = crypto.encrypt(plaintext)
        patch = requests.patch(
            base,
            headers={**headers, 'Prefer': 'return=minimal'},
            params={'user_id': f"eq.{row['user_id']}", 'provider': f"eq.{row['provider']}"},
            json={'encrypted_key': new_ciphertext},
            timeout=15,
        )
        if patch.status_code >= 400:
            print(
                f"Failed to write re-encrypted key for {row['provider']}/{row['user_id']}: "
                f'{patch.status_code} {patch.text}',
                file=sys.stderr,
            )
            failed += 1
            continue
        rotated += 1

    verb = 'would be re-encrypted' if args.dry_run else 're-encrypted'
    print(f'{len(rows)} total row(s). {already_current} already under the current primary key, '
          f'{rotated} {verb}, {failed} failed.')
    if failed:
        sys.exit(1)
    if not args.dry_run and rotated == 0 and already_current == len(rows):
        print('Every row is under the current primary key — safe to drop the retired key '
              'from LLM_KEY_ENCRYPTION_KEY_PREVIOUS now.')


if __name__ == '__main__':
    main()
