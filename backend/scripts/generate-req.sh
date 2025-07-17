#!/bin/bash

# IMPORTANT: This script must be run from the **backend/** directory (e.g. `./scripts/generate-req.sh`)
# DO NOT execute from scripts/ directory.

: '
Description:
    Generate requirements.txt file for Python project, including top-level packages and editable installations.

Usage:
    ./generate-req.sh
'

uv sync

uv export --no-hashes --format requirements-txt > requirements.txt