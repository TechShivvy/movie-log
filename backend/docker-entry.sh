#!/bin/bash

printenv | grep -v "no_proxy" >> /etc/environment

# uvicorn app:app --host "::" --port 8080 --timeout-keep-alive 60 --workers 1
# uvicorn app:app --host "0.0.0.0" --port 8080 --timeout-keep-alive 60 --workers 4

if [ "$ENV" == "PROD" ]; then
    echo "Running in PROD"
    gunicorn app:app --preload --worker-class uvicorn.workers.UvicornWorker --bind "0.0.0.0:8080" --timeout 60 --workers 4
else
    echo "Running in DEV"
    uvicorn app:app --host "0.0.0.0" --port 8080 --timeout-keep-alive 60 --workers 1 --reload
fi
