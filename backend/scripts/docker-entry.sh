#!/bin/bash
set -euox pipefail

# uvicorn app:app --host "::" --port 8080 --timeout-keep-alive 60 --workers 1
# uvicorn app:app --host "0.0.0.0" --port 8080 --timeout-keep-alive 60 --workers 4

echo "Starting application..."

if [ "$ENV" == "PROD" ]; then
    echo "Running in PROD environment."
    exec gunicorn app:app \
        --preload \
        --worker-class uvicorn.workers.UvicornWorker \
        --bind "0.0.0.0:8080" \
        --timeout 60 \
        --workers 4
else
    echo "Running in DEV environment."
    exec uvicorn app:app \
        --host "0.0.0.0" \
        --port 8080 \
        --timeout-keep-alive 60 \
        --workers 1
fi

echo "Error: Application failed to start or ENV variable not set correctly."
exit 1