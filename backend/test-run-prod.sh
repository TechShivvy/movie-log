#!/bin/bash

docker rm -f movie-log-backend-prod || true

docker run \
    --env-file .env \
    --env ENV="DEV" \
    --name "movie-log-backend-prod" \
    -p 8080:8080 \
    --network bridge \
    --tty \
    --rm \
    "registry-1.docker.io/brokolee/movie-log-backend:prod"