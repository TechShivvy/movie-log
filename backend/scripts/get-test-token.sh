#!/usr/bin/env bash
# scripts/get-test-token.sh
# Usage: ./get-test-token.sh user@example.com yourpassword
# Can be run from anywhere — resolves backend/.env relative to this script's
# own location, not the caller's working directory (same fix as the other
# scripts here — see run-local-native.sh for the full rationale).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"

[ -f "$BACKEND_DIR/.env" ] && source "$BACKEND_DIR/.env"

: "${SUPABASE_URL:?Set SUPABASE_URL}"
: "${SUPABASE_PUBLISHABLE_KEY:?Set SUPABASE_PUBLISHABLE_KEY}"

EMAIL="${1:?email required}"
PASSWORD="${2:?password required}"

curl -s -X POST "${SUPABASE_URL}/auth/v1/token?grant_type=password" \
  -H "apikey: ${SUPABASE_PUBLISHABLE_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])"