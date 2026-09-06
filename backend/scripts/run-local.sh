#!/usr/bin/env bash
set -euo pipefail
# set -x  # Uncomment for verbose output during debugging
# Can be run from anywhere — resolves backend/ relative to this script's own
# location (see below), not the caller's working directory.

: '
Description:
    Runs the dev version of the movie-log backend application in a Docker container for local development and testing.

Usage:
    ./scripts/run-local.sh

Behavior:
    - Removes any existing container named "movie-log-backend-dev".
    - Runs a new Docker container with the application in DEV mode.
    - Maps the local port 8080 to the container'\''s port 8080.
    - Uses the environment variables from the .env file.
    - Sets the API version from the get-version.sh script.

Prerequisites:
    - The image must be built locally using "./scripts/build.sh" or "docker-compose -f docker-compose.dev.yaml build" before running this.
'

# Resolve backend/ relative to this script's own location, not $PWD — so
# --env-file .env and get-version.sh both resolve against backend/.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
cd "$BACKEND_DIR"

IFS=' ' read -r app ver < <("../get-version.sh" -q)

app="${app}-backend"

docker rm -f movie-log-backend-dev || true

docker run \
    --env-file .env \
    --env ENV="DEV" \
    --env API_VERSION="$ver" \
    --name "movie-log-backend-dev" \
    -p 8080:8080 \
    --network bridge \
    --tty \
    --rm \
    "$app":"$ver"