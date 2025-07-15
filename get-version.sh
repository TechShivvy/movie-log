#!/bin/bash

: '
Description:
    Extracts the application name (from the Git remote URL) and version (from Git tags).

Usage:
    ./get-version.sh [-q]
    -q    Quiet output: prints only "<app> <version>"

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