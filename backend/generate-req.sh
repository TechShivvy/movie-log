#!/bin/bash

: '
Description:
    Generate requirements.txt file for Python project, including top-level packages and editable installations.

Usage:
    ./generate-req.sh
'

uv sync

uv export --no-hashes --format requirements-txt > requirements.txt