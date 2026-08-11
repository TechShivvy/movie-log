#!/usr/bin/env bash
set -euo pipefail
# set -x  # Uncomment for verbose output during debugging
# Can be run from anywhere — resolves backend/ relative to this script's own
# location (see below), not the caller's working directory.

: '
Description:
    Generate requirements.txt file for Python project, including top-level packages and editable installations.

Usage:
    ./generate-req.sh

Behavior:
    - Uses "uv sync" to synchronize the environment.
    - Exports the requirements to "requirements.txt" in a format suitable for pip.
    - Excludes hashes from the output.
'

# Resolve backend/ relative to this script's own location, not $PWD — so
# `uv sync`/`uv export` operate on the right pyproject.toml/.venv and
# requirements.txt lands in backend/, not wherever this was invoked from.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
cd "$BACKEND_DIR"

uv sync

uv export --no-hashes --format requirements-txt > requirements.txt