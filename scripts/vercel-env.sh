#!/usr/bin/env bash
# Push the app's build-time env vars to Vercel.
#
# Reads VITE_* keys from a local env file (default: .env) and adds each one to
# the linked Vercel project for the target environments. Safe to re-run:
# an existing var is removed first, then re-added with the current value.
#
# Prereqs:
#   npm i -g vercel   # or: npx vercel ...
#   vercel login
#   vercel link       # from the repo root, once
#
# Usage:
#   scripts/vercel-env.sh                       # from .env, all environments
#   scripts/vercel-env.sh .env.production       # from a different file
#   ENVIRONMENTS="production preview" scripts/vercel-env.sh

set -euo pipefail

ENV_FILE="${1:-.env}"
ENVIRONMENTS="${ENVIRONMENTS:-production preview development}"

# Only these keys are shipped to the client bundle. Anything else in .env
# (service-role keys, etc.) must never be added as a VITE_ var.
ALLOWED_PREFIX="VITE_"

vercel_bin() {
  if command -v vercel >/dev/null 2>&1; then vercel "$@"; else npx --yes vercel "$@"; fi
}

if [[ ! -f "$ENV_FILE" ]]; then
  echo "error: env file not found: $ENV_FILE" >&2
  exit 1
fi

if [[ ! -d .vercel ]]; then
  echo "error: project not linked. Run 'vercel link' from the repo root first." >&2
  exit 1
fi

while IFS= read -r line || [[ -n "$line" ]]; do
  line="${line%%$'\r'}"
  [[ -z "$line" || "$line" == \#* ]] && continue
  [[ "$line" != *=* ]] && continue

  key="${line%%=*}"
  val="${line#*=}"
  key="$(printf '%s' "$key" | xargs)"

  [[ "$key" != ${ALLOWED_PREFIX}* ]] && { echo "skip  $key (not ${ALLOWED_PREFIX}*)"; continue; }
  [[ -z "$val" ]] && { echo "skip  $key (empty value)"; continue; }

  for target in $ENVIRONMENTS; do
    vercel_bin env rm "$key" "$target" --yes >/dev/null 2>&1 || true
    printf '%s' "$val" | vercel_bin env add "$key" "$target" >/dev/null
    echo "set   $key -> $target"
  done
done < "$ENV_FILE"

echo "done. Trigger a redeploy for the new values to take effect: vercel --prod"
