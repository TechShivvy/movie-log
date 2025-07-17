#!/bin/bash

# IMPORTANT: This script must be run from the **backend/** directory (e.g. `./scripts/test-run-prod.sh`)
# DO NOT execute from scripts/ directory.

docker rm -f movie-log-backend-prod || true

docker run \
    --env-file .env \
    --env ENV="PROD" \
    --name "movie-log-backend-prod" \
    -p 8080:8080 \
    --network bridge \
    --tty \
    --rm \
    "registry-1.docker.io/brokolee/movie-log-backend:prod"