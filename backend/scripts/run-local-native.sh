#!/usr/bin/env bash
set -euo pipefail
# set -x  # Uncomment for verbose output during debugging
# Can be run from anywhere — resolves paths relative to this script's own
# location, not the caller's working directory (see below).

: '
Description:
    Runs the backend natively via uv (no Docker) for fast local iteration —
    auto-reload, no image rebuild between changes. Use run-local.sh instead
    if you want a container matching the actual prod/dev image.

    Three things this script gets right that are easy to get wrong by hand:

    1. `app.py` imports as `from config import settings` (relative to
       app/ being the import root, matching WORKDIR in the Dockerfiles) —
       config.yaml is also loaded via a path relative to the *process*
       cwd, not just sys.path. So both uv AND uvicorn need to run with
       app/ as the actual working directory, while `--project` tells uv
       where to find pyproject.toml/uv.lock/.venv (one level up). Resolved
       from this script'\''s own path, so it works no matter where you `cd`
       from before running it (`./scripts/run-local-native.sh`,
       `backend/scripts/run-local-native.sh`, or an absolute path all work).

    2. ENV is read via a raw os.getenv("ENV", "LOCAL") at import time
       (app/config/settings.py:get_settings), before pydantic-settings
       has loaded .env — so it MUST be exported into the shell, not just
       set in .env. This script does that for you.

    3. `uv` frequently isn'\''t on PATH even when installed (e.g. a
       `pip install --user uv` puts it under a Python user-scripts dir
       most shells don'\''t add to PATH by default). Falls back to checking
       the common install locations below before giving up.

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

# Resolve backend/ relative to this script's own location, not $PWD, so it
# doesn't matter whether you run it as ./run-local-native.sh (from
# scripts/), ./scripts/run-local-native.sh (from backend/), or
# backend/scripts/run-local-native.sh (from the repo root).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"

# Find uv even if it's not on PATH (common after `pip install --user uv`,
# which most shells don't add to PATH automatically).
if command -v uv >/dev/null 2>&1; then
    UV=uv
else
    UV=""
    for candidate in \
        "$HOME"/AppData/Roaming/Python/Python*/Scripts/uv.exe \
        "$HOME"/.local/bin/uv \
        "$HOME"/.cargo/bin/uv
    do
        if [ -x "$candidate" ]; then
            UV="$candidate"
            break
        fi
    done
    if [ -z "$UV" ]; then
        echo "error: uv not found on PATH or in any common install location." >&2
        echo "Install it: https://docs.astral.sh/uv/getting-started/installation/" >&2
        echo "  (Windows PowerShell: irm https://astral.sh/uv/install.ps1 | iex)" >&2
        echo "  (or: pip install --user uv)" >&2
        echo "Then either restart your shell so PATH picks it up, or re-run this script." >&2
        exit 1
    fi
    echo "note: uv not on PATH, using $UV — consider adding its folder to PATH permanently." >&2
fi

# Windows only: python-magic-bin isn't tracked in pyproject.toml (it's a
# Windows-only libmagic shim — Linux/Docker use the real libmagic1 via apt,
# see the Prerequisites note above), so `uv sync`/`uv run` silently strips
# it out again every time it touches the venv (a dependency change, or a
# .python-version bump like this repo just had). Left alone, the next
# worker start doesn't raise a catchable ImportError — the whole process
# segfaults on `import magic`, which just looks like uvicorn hanging with
# no error at all. Self-heal here instead.
if [ -f "$BACKEND_DIR/.venv/Scripts/python.exe" ]; then
    if ! "$BACKEND_DIR/.venv/Scripts/python.exe" -c "import magic" >/dev/null 2>&1; then
        echo "note: python-magic-bin missing (fresh/rebuilt venv) — reinstalling..." >&2
        "$BACKEND_DIR/.venv/Scripts/python.exe" -m pip install -q python-magic-bin
    fi
fi

cd "$BACKEND_DIR/app"
"$UV" run --project .. uvicorn app:app --host 0.0.0.0 --port 8080 --reload
