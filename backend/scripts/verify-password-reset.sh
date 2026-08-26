#!/usr/bin/env bash
# scripts/verify-password-reset.sh
# Usage: ./verify-password-reset.sh
#
# Password reset is entirely a Supabase Auth + client concern (see
# routers/auth.py's module docstring) — there's no backend endpoint to test.
# This proves the *Supabase project itself* is configured correctly for it,
# end to end, without needing a frontend or a real inbox: creates a
# throwaway user, asks Supabase for a recovery link the same way
# resetPasswordForEmail() would trigger one, verifies it (that's the step a
# clicked email link performs), sets a new password with the resulting
# recovery session, then confirms the old password stops working and the
# new one works. Cleans up the test user either way.
#
# Can be run from anywhere — resolves backend/.env relative to this script's
# own location, not the caller's working directory (see run-local-native.sh).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"

[ -f "$BACKEND_DIR/.env" ] && source "$BACKEND_DIR/.env"

: "${SUPABASE_URL:?Set SUPABASE_URL}"
: "${SUPABASE_PUBLISHABLE_KEY:?Set SUPABASE_PUBLISHABLE_KEY}"
ADMIN_KEY="${SUPABASE_SECRET_KEY:-${SUPABASE_SERVICE_ROLE_KEY:-}}"
: "${ADMIN_KEY:?Set SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY)}"

EMAIL="password-reset-verify+$(date +%s)@example.com"
OLD_PASSWORD="OldPassw0rd!$$"
NEW_PASSWORD="NewPassw0rd!$$"

USER_ID=""
cleanup() {
  if [ -n "$USER_ID" ]; then
    curl -s -X DELETE "${SUPABASE_URL}/auth/v1/admin/users/${USER_ID}" \
      -H "apikey: ${ADMIN_KEY}" -H "Authorization: Bearer ${ADMIN_KEY}" > /dev/null
    echo "cleaned up test user ${USER_ID}"
  fi
}
trap cleanup EXIT

echo "1. creating throwaway user ${EMAIL}..."
CREATE_RESPONSE=$(curl -s -X POST "${SUPABASE_URL}/auth/v1/admin/users" \
  -H "apikey: ${ADMIN_KEY}" -H "Authorization: Bearer ${ADMIN_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${OLD_PASSWORD}\",\"email_confirm\":true}")
USER_ID=$(echo "$CREATE_RESPONSE" | python -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "   user_id=${USER_ID}"

echo "2. generating a recovery link (what resetPasswordForEmail() triggers)..."
LINK_RESPONSE=$(curl -s -X POST "${SUPABASE_URL}/auth/v1/admin/generate_link" \
  -H "apikey: ${ADMIN_KEY}" -H "Authorization: Bearer ${ADMIN_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"type\":\"recovery\",\"email\":\"${EMAIL}\"}")
TOKEN_HASH=$(echo "$LINK_RESPONSE" | python -c "import sys,json; print(json.load(sys.stdin)['hashed_token'])")

echo "3. verifying the recovery token (what clicking the email link does)..."
VERIFY_RESPONSE=$(curl -s -X POST "${SUPABASE_URL}/auth/v1/verify" \
  -H "apikey: ${SUPABASE_PUBLISHABLE_KEY}" -H "Content-Type: application/json" \
  -d "{\"type\":\"recovery\",\"token_hash\":\"${TOKEN_HASH}\"}")
RECOVERY_TOKEN=$(echo "$VERIFY_RESPONSE" | python -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

echo "4. setting a new password with the recovery session (what updateUser() does)..."
curl -s -X PUT "${SUPABASE_URL}/auth/v1/user" \
  -H "apikey: ${SUPABASE_PUBLISHABLE_KEY}" -H "Authorization: Bearer ${RECOVERY_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"password\":\"${NEW_PASSWORD}\"}" > /dev/null

echo "5. confirming the old password no longer signs in..."
OLD_LOGIN=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${SUPABASE_URL}/auth/v1/token?grant_type=password" \
  -H "apikey: ${SUPABASE_PUBLISHABLE_KEY}" -H "Content-Type: application/json" \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${OLD_PASSWORD}\"}")
if [ "$OLD_LOGIN" = "200" ]; then
  echo "   FAIL: old password still works (status ${OLD_LOGIN})"; exit 1
fi
echo "   ok (status ${OLD_LOGIN})"

echo "6. confirming the new password signs in..."
NEW_LOGIN=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${SUPABASE_URL}/auth/v1/token?grant_type=password" \
  -H "apikey: ${SUPABASE_PUBLISHABLE_KEY}" -H "Content-Type: application/json" \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${NEW_PASSWORD}\"}")
if [ "$NEW_LOGIN" != "200" ]; then
  echo "   FAIL: new password does not work (status ${NEW_LOGIN})"; exit 1
fi
echo "   ok (status ${NEW_LOGIN})"

echo "PASS: password reset flow verified end-to-end."
