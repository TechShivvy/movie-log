#!/bin/bash

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