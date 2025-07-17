#!/usr/bin/env bash
set -euo pipefail
# set -x  # Uncomment for verbose output during debugging

# IMPORTANT: This script must be run from the **backend/** directory (e.g. `./scripts/build.sh`)
# DO NOT execute from scripts/ directory.

: '
Description:
    Retrieves the application name and version by invoking the
    get-version.sh script located in the parent directory.
    Optionally appends a suffix (e.g., "backend" or "frontend") to the app name.

Usage:
    ./build.sh [SUFFIX]
    SUFFIX   (optional) String to append to the app name.

Behavior:
    - If no suffix is provided, the app name will be derived from the get-version.sh script.
    - If a suffix is provided, it will be appended to the app name.
    - The script builds a Docker image using the specified Dockerfile and tags it with the app name and version.

Example:
    ./scripts/build.sh
    App: myrepo
    Version: v1.2.3

    ./scripts/build.sh backend
    App: myrepo-backend
    Version: v1.2.3
'

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
