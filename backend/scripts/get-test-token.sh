#!/usr/bin/env bash
# scripts/get-test-token.sh
# Usage: ./get-test-token.sh user@example.com yourpassword
set -euo pipefail

[ -f .env ] && source .env

: "${SUPABASE_URL:?Set SUPABASE_URL}"
: "${SUPABASE_PUBLISHABLE_KEY:?Set SUPABASE_PUBLISHABLE_KEY}"

EMAIL="${1:?email required}"
PASSWORD="${2:?password required}"

curl -s -X POST "${SUPABASE_URL}/auth/v1/token?grant_type=password" \
  -H "apikey: ${SUPABASE_PUBLISHABLE_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])"