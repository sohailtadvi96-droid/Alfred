#!/usr/bin/env bash
# Verify Step 2 (design-capture, docs/DESIGN.md) end to end against the
# deployed edge function.
#
# Exchanges ALFRED_EMAIL / ALFRED_PASSWORD for a user JWT via the Supabase
# password grant, then runs four tests against design-capture. Each positive
# test is verified with a PostgREST query joining design_items to
# design_boards under that same user JWT (RLS-scoped) — not just the HTTP
# status design-capture returned.
#
# Requires in the environment: ALFRED_EMAIL, ALFRED_PASSWORD.
# Reads VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY from .env unless already
# exported. Requires curl and jq.
#
# Usage:
#   ALFRED_EMAIL=... ALFRED_PASSWORD=... scripts/verify-design-capture.sh

set -uo pipefail  # no -e: a failed test must not stop the remaining ones

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

: "${ALFRED_EMAIL:?set ALFRED_EMAIL in the environment}"
: "${ALFRED_PASSWORD:?set ALFRED_PASSWORD in the environment}"
: "${VITE_SUPABASE_URL:?set VITE_SUPABASE_URL (.env or environment)}"
: "${VITE_SUPABASE_ANON_KEY:?set VITE_SUPABASE_ANON_KEY (.env or environment)}"

SUPABASE_URL="${VITE_SUPABASE_URL%/}"
ANON_KEY="$VITE_SUPABASE_ANON_KEY"
FN_URL="$SUPABASE_URL/functions/v1/design-capture"
REST_URL="$SUPABASE_URL/rest/v1"
AUTH_URL="$SUPABASE_URL/auth/v1/token?grant_type=password"
CURL="curl -sS --max-time 20"

PASS=0
FAIL=0
pass() { PASS=$((PASS + 1)); echo "PASS  $1"; }
fail() {
  FAIL=$((FAIL + 1))
  echo "FAIL  $1"
  [[ -n "${2:-}" ]] && echo "      $2"
}

# ---------------------------------------------------------------- auth ----
echo "== authenticating $ALFRED_EMAIL =="
AUTH_RESP="$($CURL -X POST "$AUTH_URL" \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg email "$ALFRED_EMAIL" --arg password "$ALFRED_PASSWORD" \
    '{email:$email,password:$password}')")"

JWT="$(jq -r '.access_token // empty' <<<"$AUTH_RESP")"
USER_ID="$(jq -r '.user.id // empty' <<<"$AUTH_RESP")"

if [[ -z "$JWT" ]]; then
  echo "auth failed — could not get an access_token:" >&2
  jq . <<<"$AUTH_RESP" >&2 2>/dev/null || echo "$AUTH_RESP" >&2
  exit 1
fi
echo "ok — authenticated as user $USER_ID"
echo

# ------------------------------------------------------------- helpers ----
NONCE="$(date +%s)-$$"

# call_capture <json body> [noauth]
# Sets CAPTURE_STATUS and CAPTURE_BODY.
call_capture() {
  local body="$1" mode="${2:-auth}" tmp status
  tmp="$(mktemp)"
  if [[ "$mode" == "noauth" ]]; then
    status="$($CURL -o "$tmp" -w '%{http_code}' -X POST "$FN_URL" \
      -H "Content-Type: application/json" \
      -H "apikey: $ANON_KEY" \
      -d "$body")"
  else
    status="$($CURL -o "$tmp" -w '%{http_code}' -X POST "$FN_URL" \
      -H "Authorization: Bearer $JWT" \
      -H "Content-Type: application/json" \
      -H "apikey: $ANON_KEY" \
      -d "$body")"
  fi
  CAPTURE_STATUS="$status"
  CAPTURE_BODY="$(cat "$tmp")"
  rm -f "$tmp"
}

# rows_for_image_url <image_url> — design_items joined to design_boards,
# scoped by RLS to this user, matched on the unique image_url each test uses.
rows_for_image_url() {
  $CURL -G "$REST_URL/design_items" \
    -H "apikey: $ANON_KEY" \
    -H "Authorization: Bearer $JWT" \
    --data-urlencode "select=id,medium,enrich_status,board_id,image_url,design_boards(id,name,is_inbox)" \
    --data-urlencode "image_url=eq.$1"
}

# --------------------------------------------------------------- tests ----

# Test 1 — valid request, no medium → 201, row lands in the Inbox board
T1_IMG="https://picsum.photos/seed/verify-$NONCE-1/800"
call_capture "$(jq -n --arg p "https://example.com/verify/$NONCE-1" --arg i "$T1_IMG" \
  '{page_url:$p, image_url:$i}')"
if [[ "$CAPTURE_STATUS" == "201" ]]; then
  ROW="$(rows_for_image_url "$T1_IMG")"
  N="$(jq 'length' <<<"$ROW" 2>/dev/null || echo 0)"
  IS_INBOX="$(jq -r '.[0].design_boards.is_inbox // empty' <<<"$ROW")"
  if [[ "$N" == "1" && "$IS_INBOX" == "true" ]]; then
    pass "Test 1 (no medium): 201, row in Inbox board"
  else
    fail "Test 1 (no medium): got 201 but DB check failed" "rows=$N is_inbox=$IS_INBOX row=$ROW"
  fi
else
  fail "Test 1 (no medium): expected 201, got $CAPTURE_STATUS" "$CAPTURE_BODY"
fi

# Test 2 — valid request, medium=editorial → 201, medium set on the row
T2_IMG="https://picsum.photos/seed/verify-$NONCE-2/800"
call_capture "$(jq -n --arg p "https://example.com/verify/$NONCE-2" --arg i "$T2_IMG" \
  '{page_url:$p, image_url:$i, medium:"editorial"}')"
if [[ "$CAPTURE_STATUS" == "201" ]]; then
  ROW="$(rows_for_image_url "$T2_IMG")"
  N="$(jq 'length' <<<"$ROW" 2>/dev/null || echo 0)"
  MEDIUM="$(jq -r '.[0].medium // empty' <<<"$ROW")"
  if [[ "$N" == "1" && "$MEDIUM" == "editorial" ]]; then
    pass "Test 2 (medium=editorial): 201, medium set on row"
  else
    fail "Test 2 (medium=editorial): got 201 but DB check failed" "rows=$N medium=$MEDIUM row=$ROW"
  fi
else
  fail "Test 2 (medium=editorial): expected 201, got $CAPTURE_STATUS" "$CAPTURE_BODY"
fi

# Test 3 — medium=typography (invalid) → 400, nothing inserted
T3_IMG="https://picsum.photos/seed/verify-$NONCE-3/800"
call_capture "$(jq -n --arg p "https://example.com/verify/$NONCE-3" --arg i "$T3_IMG" \
  '{page_url:$p, image_url:$i, medium:"typography"}')"
if [[ "$CAPTURE_STATUS" == "400" ]]; then
  ROW="$(rows_for_image_url "$T3_IMG")"
  N="$(jq 'length' <<<"$ROW" 2>/dev/null || echo 0)"
  if [[ "$N" == "0" ]]; then
    pass "Test 3 (medium=typography, invalid): 400, nothing inserted"
  else
    fail "Test 3 (medium=typography, invalid): got 400 but a row was inserted" "row=$ROW"
  fi
else
  fail "Test 3 (medium=typography, invalid): expected 400, got $CAPTURE_STATUS" "$CAPTURE_BODY"
fi

# Test 4 — no Authorization header → 401
T4_IMG="https://picsum.photos/seed/verify-$NONCE-4/800"
call_capture "$(jq -n --arg p "https://example.com/verify/$NONCE-4" --arg i "$T4_IMG" \
  '{page_url:$p, image_url:$i}')" noauth
if [[ "$CAPTURE_STATUS" == "401" ]]; then
  ROW="$(rows_for_image_url "$T4_IMG")"
  N="$(jq 'length' <<<"$ROW" 2>/dev/null || echo 0)"
  if [[ "$N" == "0" ]]; then
    pass "Test 4 (no Authorization header): 401, nothing inserted"
  else
    fail "Test 4 (no Authorization header): got 401 but a row was inserted anyway" "row=$ROW"
  fi
else
  fail "Test 4 (no Authorization header): expected 401, got $CAPTURE_STATUS" "$CAPTURE_BODY"
fi

# ------------------------------------------------------------- summary ----
echo
echo "== last 5 design_items rows =="
$CURL -G "$REST_URL/design_items" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $JWT" \
  --data-urlencode "select=id,created_at,medium,enrich_status,board_id,image_url,link_url,design_boards(name,is_inbox)" \
  --data-urlencode "order=created_at.desc" \
  --data-urlencode "limit=5" | jq .

echo
echo "PASS: $PASS  FAIL: $FAIL"
[[ "$FAIL" -eq 0 ]]
