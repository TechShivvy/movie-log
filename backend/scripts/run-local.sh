#!/usr/bin/env bash
set -euo pipefail
# set -x  # Uncomment for verbose output during debugging
# IMPORTANT: This script must be run from the **backend/** directory (e.g. `./scripts/run-local.sh`)
# DO NOT execute from scripts/ directory.

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