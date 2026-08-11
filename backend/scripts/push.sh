#!/usr/bin/env bash
set -euo pipefail
# set -x  # Uncomment for verbose output during debugging
# Can be run from anywhere — resolves backend/ relative to this script's own
# location (see below), not the caller's working directory.

: '
Description:
    Tags and pushes the locally built backend Docker image to the registry.

Usage:
    ./push.sh

Prerequisites:
    - The image must be built locally before running this.
    - Docker must be logged in.
    - REGISTRY_HOST must be set (for eg via: source ./scripts/login-docker.sh).
'

# Resolve backend/ relative to this script's own location, not $PWD.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
cd "$BACKEND_DIR"

IFS=' ' read -r app ver < <("../get-version.sh" -q)
app="${app}-backend"

echo "App: $app"
echo "Version: $ver"

if [ -z "${REGISTRY_HOST:-}" ]; then
    echo >&2 "Error: REGISTRY_HOST is not set."
    echo >&2 "Please run: source ./login-docker.sh"
    exit 1
fi

full_image="$REGISTRY_HOST/$app:$ver"
local_image="$app:$ver"

if ! docker image inspect "$local_image" > /dev/null 2>&1; then
    echo >&2 "Error: Local image '$local_image' not found."
    echo >&2 "Make sure you've built it using: ./build.sh"
    exit 1
fi

docker tag "$local_image" "$full_image"
docker push "$full_image"

echo "Successfully pushed: $full_image"
