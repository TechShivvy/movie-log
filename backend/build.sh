#!/bin/bash

: '
Description:
    Retrieves the application name and version by invoking the
    get-version.sh script located in the parent directory.
    Optionally appends a suffix (e.g., "backend" or "frontend") to the app name.

Usage:
    ./build.sh [SUFFIX]
    SUFFIX   (optional) String to append to the app name.

Example:
    ./build.sh
    App: myrepo
    Version: v1.2.3

    ./build.sh backend
    App: myrepo-backend
    Version: v1.2.3
'

set -euox pipefail

IFS=' ' read -r app ver < <("../get-version.sh" -q)

app="${app}-backend"

# SUFFIX appending is disabled
# if [[ -n "${1:-}" ]]; then
#     app="${app}-$1"
# fi

echo "App: $app"
echo "Version: $ver"

# Check if running on ARM architecture
if [[ "$(uname -m)" == "arm64" || "$(uname -m)" == "aarch64" ]]; then
    if ! docker buildx inspect --bootstrap >/dev/null 2>&1; then
        docker buildx create --use
    fi
    docker buildx build --platform linux/amd64 --build-arg API_VERSION="$ver" -t "$app":"$ver" -f dev.Dockerfile --load .
else
    docker build --platform linux/amd64 --build-arg API_VERSION="$ver" -t "$app":"$ver" -f dev.Dockerfile --load .
fi
