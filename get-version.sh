#!/bin/bash

# NOTE: This script can be run from anywhere as long as the directory you are running it from is inside this git repo.

: '
Description:
    Extracts the application name (from the Git remote URL) and version (from Git tags).

Usage:
    ./get-version.sh [-q]
    -q    Quiet output: prints only "<app> <version>"

Behavior:
    - If no arguments are provided, it prints the app name and version in a formatted output
    - If "-q" is provided, it prints only the app name and version separated by a space.
    - The app name is derived from the Git remote URL.
    - The version is derived from the latest Git tag or defaults to "dev". If no tags are found, it also defaults to "dev".
    - If the app name cannot be determined, it exits with an error message.

Example:
    ./get-version.sh
    App: myrepo
    Version: v1.2.3

    ./get-version.sh -q
    myrepo v1.2.3
'

set -euox pipefail

app=$(git config --get remote.origin.url | awk -F / '{print $NF}' | sed 's/\..*//')
ver=$(git -c core.filemode=false describe --tags --dirty 2>/dev/null || echo "dev")

if [ -z "$app" ]; then
    echo "The image name is taken from the git repo. Please ensure this project is a valid git repo."
    exit 1
fi

if [ "$1" == "-q" ]; then
    echo "$app $ver"
    exit 0
fi

echo -e "App:\t\t$app\nVersion:\t$ver"

echo -e "\n\tNote: annotate a version as follows when preparing a release:\n\tgit tag -a v1.1.2 -m \"tag description\"\n\tgit push --tags"