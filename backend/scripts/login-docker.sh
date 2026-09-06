#!/usr/bin/env bash
set -euo pipefail
# set -x  # Uncomment for verbose output during debugging
# Can be run (sourced) from anywhere — it doesn't touch any backend/-relative
# files, unlike the other scripts here, so no path resolution is needed. Not
# `cd`-ing on purpose: this is meant to be `source`d, and a `cd` here would
# silently change the caller's own shell directory too.

: '
Description:
    Logs into Docker Hub and sets the REGISTRY_HOST environment variable for image pushes under the "brokolee" namespace.

Usage:
    source ./login-docker.sh

Behavior:
    - prompts for Docker Hub credentials if needed
    - sets REGISTRY_HOST to "registry-1.docker.io/brokolee"
'


# Use Docker Hub's registry domain for authentication
host="registry-1.docker.io"

docker login "$host"

# Export the registry host with your namespace for later use
export REGISTRY_HOST="$host/brokolee"
