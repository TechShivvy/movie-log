#!/usr/bin/env bash
set -euo pipefail
# set -x  # Uncomment for verbose output during debugging
# IMPORTANT: This script must be run from the **backend/** directory (e.g. `./scripts/run-local-native.sh`)
# DO NOT execute from scripts/ directory.

: '
Description:
    Runs the backend natively via uv (no Docker) for fast local iteration —
    auto-reload, no image rebuild between changes. Use run-local.sh instead
    if you want a container matching the actual prod/dev image.

    Two things this script gets right that are easy to get wrong by hand:

    1. `app.py` imports as `from config import settings` (relative to
       app/ being the import root, matching WORKDIR in the Dockerfiles) —
       config.yaml is also loaded via a path relative to the *process*
       cwd, not just sys.path. So both uv AND uvicorn need to run with
       app/ as the actual working directory, while `--project ..` tells
       uv where to find pyproject.toml/uv.lock/.venv (one level up).

    2. ENV is read via a raw os.getenv("ENV", "LOCAL") at import time
       (app/config/settings.py:get_settings), before pydantic-settings
       has loaded .env — so it MUST be exported into the shell, not just
       set in .env. This script does that for you.

Prerequisites:
    - uv installed (https://docs.astral.sh/uv/).
    - Windows only: `python-magic` (a hard pyproject dependency, used for
      upload content-type sniffing) needs the real libmagic C library.
      Linux/Docker get it via apt (see Dockerfile.dev); native Windows has
      no equivalent and `import magic` will *segfault*, not raise a clean
      ImportError. Fix once per machine:
          uv run python -m pip install python-magic-bin
      (Not added to pyproject.toml — it is a Windows-only shim and would
      be dead weight in the Linux/Docker image.)

Usage:
    ENV=LOCAL ./scripts/run-local-native.sh
    (ENV defaults to LOCAL if not set; see DEV_BYPASS_AUTH note below.)

Auth while testing locally:
    - DEV_BYPASS_AUTH=true in .env skips JWT verification for endpoints
      that only check identity locally (e.g. GET /api/v1/auth/me) when no
      bearer token is sent. It does NOT help for movie-logs/venues/public
      endpoints — those proxy to PostgREST with the caller'\''s own token,
      and Supabase/RLS need a *real* token regardless of this flag.
    - For those, mint a real token with a password-auth test user:
          ./scripts/get-test-token.sh test-user@example.com yourpassword
      then `curl -H "Authorization: Bearer <token>" ...`.
'

export ENV="${ENV:-LOCAL}"

cd app
uv run --project .. uvicorn app:app --host 0.0.0.0 --port 8080 --reload
