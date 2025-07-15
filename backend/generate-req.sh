#!/bin/bash

: '
Description:
    Generate requirements.txt file for Python project, including top-level packages and editable installations.

Usage:
    ./generate-req.sh
'

# Generate requirements.txt with editable installations
pipdeptree -f --warn silence | grep -E '^[a-zA-Z0-9\-]+' > requirements.txt

# Optionally, include editable installations
# pipdeptree -f --warn silence | grep -E '^-e' >> requirements.txt

# pipdeptree -f | tee requirements.txt
# pipdeptree -f -w silence | grep -E '^\w+'
