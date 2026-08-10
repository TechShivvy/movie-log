#!/usr/bin/env bash
# scripts/get-google-token.sh
# Real Google sign-in against Supabase -> a usable Bearer token, with no
# frontend involved. Opens a browser for the actual Google login, then
# prints the resulting Supabase access_token to stdout.
#
# Usage:
#   ./get-google-token.sh
#   ./get-google-token.sh --verify https://movie-log-backend.onrender.com
#
# Resolves paths relative to this script's own location, so it works no
# matter where you `cd` from before running it.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Prefer the backend's own venv (has `requests` installed, and avoids a
# Windows-specific trap: `python`/`python3` can exist on PATH as Microsoft
# Store app-execution-alias stubs that print an install prompt and fail
# instead of actually running anything, even though `command -v` finds
# them). Fall back to whatever real interpreter is on PATH otherwise.
if [ -x "$SCRIPT_DIR/../.venv/Scripts/python" ]; then
    PYTHON="$SCRIPT_DIR/../.venv/Scripts/python"
elif [ -x "$SCRIPT_DIR/../.venv/bin/python" ]; then
    PYTHON="$SCRIPT_DIR/../.venv/bin/python"
elif command -v python3 >/dev/null 2>&1 && python3 --version >/dev/null 2>&1; then
    PYTHON=python3
elif command -v python >/dev/null 2>&1 && python --version >/dev/null 2>&1; then
    PYTHON=python
else
    echo "error: no working Python interpreter found (checked backend/.venv and PATH)." >&2
    exit 1
fi

exec "$PYTHON" "$SCRIPT_DIR/google_login.py" "$@"
