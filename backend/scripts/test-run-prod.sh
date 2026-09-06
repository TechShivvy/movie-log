#!/usr/bin/env bash
set -euo pipefail
# set -x  # Uncomment for verbose output during debugging
# Can be run from anywhere — resolves backend/ relative to this script's own
# location (see below), not the caller's working directory.

: '
Description:
    Runs the prod version of the movie-log backend application in a Docker container for production testing.

Usage:
    ./scripts/test-run-prod.sh

Behavior:
    - Removes any existing container named "movie-log-backend-prod".
    - Runs a new Docker container with the application in PROD mode.
    - Maps the local port 8080 to the container'\''s port 8080.
    - Uses the environment variables from the .env file.
    - Sets the API version from the get-version.sh script.

Prerequisites:
    - The image must be built locally using "docker-compose -f docker-compose.prod.yaml build" before running this.
'

# Resolve backend/ relative to this script's own location, not $PWD — so
# --env-file .env resolves against backend/.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
cd "$BACKEND_DIR"

docker rm -f movie-log-backend-prod || true

docker run \
    --env-file .env \
    --env ENV="PROD" \
    --name "movie-log-backend-prod" \
    -p 8080:8080 \
    --network bridge \
    --rm \
    "registry-1.docker.io/brokolee/movie-log-backend:prod"