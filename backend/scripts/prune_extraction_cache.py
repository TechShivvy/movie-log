#!/usr/bin/env python
"""Deletes extraction_cache rows whose prompt_version no longer matches
the app's current one (services/extraction_cache.py derives it from a
hash of the live prompt content — a version bump makes old rows
unreachable immediately, but doesn't delete them; this actually does).

Not run automatically — old rows are harmless clutter, not a
correctness problem, so there's no urgency; run this by hand whenever
you want to reclaim the space. Calls the prune_extraction_cache RPC
(supabase/migrations/20260811000009_extraction_cache_prune.sql) with
the backend's own secret key, same privileged-access pattern the rest
of extraction_cache.py already uses.

Usage:
    python scripts/prune_extraction_cache.py
    python scripts/prune_extraction_cache.py --dry-run
"""

import argparse
import os
import sys

import requests

# So this can import the app's real prompts/cache modules and compute
# PROMPT_VERSION exactly the way the running app does — never
# hardcoded/duplicated here, which would just reintroduce the same
# "forgot to keep two places in sync" risk the hash-based version was
# built to eliminate in the first place.
_APP_DIR = os.path.join(os.path.dirname(__file__), '..', 'app')
sys.path.insert(0, _APP_DIR)
# config/settings.py loads config.yaml relative to the process's cwd, not
# just sys.path (same quirk scripts/run-local-native.sh already works
# around for the same reason) — importing services.extraction_cache
# without this fails with a wall of "field required" errors that have
# nothing to do with what's actually missing.
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
        '--dry-run', action='store_true', help="Show the current version without deleting anything."
    )
    args = parser.parse_args()

    from services.extraction_cache import PROMPT_VERSION

    if args.dry_run:
        print(f'Current PROMPT_VERSION: {PROMPT_VERSION}')
        print('(dry run — nothing deleted; rerun without --dry-run to actually prune)')
        return

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

    response = requests.post(
        f"{supabase_url.rstrip('/')}/rest/v1/rpc/prune_extraction_cache",
        headers={'apikey': key, 'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'},
        json={'p_current_version': PROMPT_VERSION},
        timeout=15,
    )
    if response.status_code >= 400:
        print(f'Prune failed: {response.status_code} {response.text}', file=sys.stderr)
        sys.exit(1)

    deleted = response.json()
    print(f'Pruned {deleted} row(s) not matching current PROMPT_VERSION ({PROMPT_VERSION}).')


if __name__ == '__main__':
    main()
