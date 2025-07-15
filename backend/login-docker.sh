#!/usr/bin/env bash
set -euo pipefail

: '
Description:
    Logs into Docker Hub and sets the REGISTRY_HOST environment variable for image pushes under the "brokolee" namespace.

Usage:
    source ./login-docker.sh

Behavior:
    - prompts for Docker Hub credentials if needed
    - sets REGISTRY_HOST to "registry-1.docker.io/brokolee" in the current shell
'

# Use Docker Hub's registry domain for authentication
host="registry-1.docker.io"

docker login "$host"

# Export the registry host with your namespace for later use
export REGISTRY_HOST="$host/brokolee"
