#!/usr/bin/env bash
# scripts/toggle-billing.sh
#
# Manual on/off/status control over Google Cloud billing for the project
# backing GOOGLE_PLACES_API_KEY (services/google_places.py, routers/venues.py:
# POST /theatres/search-places and the place_id resolution in POST /theatres).
#
# This is the same action the automated budget kill-switch takes (see the
# `stop-billing` Cloud Function, wired to a ~₹1 budget alert via Pub/Sub) —
# unlinking the project from its billing account, which stops all further
# billable usage project-wide, not just Places specifically. Having this as
# a script too means you don't have to wait for a budget alert (or write a
# one-off gcloud command from memory) to pull the switch yourself — e.g.
# before a long period you won't be watching it, or to confirm the automated
# switch actually re-links cleanly after firing.
#
# Usage:
#   ./toggle-billing.sh status   # show whether billing is currently linked
#   ./toggle-billing.sh off      # disable billing (Places stops working)
#   ./toggle-billing.sh on       # re-enable billing (relinks the account)
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-movie-log-468317}"
BILLING_ACCOUNT_ID="${GCP_BILLING_ACCOUNT_ID:-0126A5-223AF6-0790B8}"

# gcloud isn't guaranteed to be on PATH — same problem run-local-native.sh
# already works around for `uv`. The Cloud SDK's Windows installer puts it
# under %LOCALAPPDATA% by default and doesn't always add itself to PATH.
resolve_gcloud() {
  if command -v gcloud >/dev/null 2>&1; then
    command -v gcloud
    return
  fi
  local candidates=(
    "${LOCALAPPDATA:-}/Google/Cloud SDK/google-cloud-sdk/bin/gcloud.cmd"
    "$HOME/google-cloud-sdk/bin/gcloud"
    "/usr/lib/google-cloud-sdk/bin/gcloud"
    "/opt/google-cloud-sdk/bin/gcloud"
  )
  for c in "${candidates[@]}"; do
    if [ -n "$c" ] && [ -f "$c" ]; then
      echo "$c"
      return
    fi
  done
  echo "gcloud not found on PATH or in common install locations. Install the Google Cloud SDK (or add it to PATH) and retry." >&2
  exit 1
}

GCLOUD="$(resolve_gcloud)"

usage() {
  echo "Usage: $0 {status|on|off}" >&2
  echo "  status  Show whether billing is currently linked for $PROJECT_ID" >&2
  echo "  off     Unlink billing (disables Places API and anything else billed on this project)" >&2
  echo "  on      Re-link billing account $BILLING_ACCOUNT_ID" >&2
  exit 1
}

[ $# -eq 1 ] || usage

case "$1" in
  status)
    "$GCLOUD" billing projects describe "$PROJECT_ID"
    ;;
  off)
    echo "Disabling billing for $PROJECT_ID — Places API (and anything else billed on this project) stops working until you run '$0 on' again." >&2
    "$GCLOUD" billing projects unlink "$PROJECT_ID"
    ;;
  on)
    echo "Re-linking $PROJECT_ID to billing account $BILLING_ACCOUNT_ID." >&2
    "$GCLOUD" billing projects link "$PROJECT_ID" --billing-account="$BILLING_ACCOUNT_ID"
    ;;
  *)
    usage
    ;;
esac
