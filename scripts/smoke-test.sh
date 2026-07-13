#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

check() {
  local path="$1" expected="$2"
  local code
  code="$(curl -kLsS -o "$TMP/body" -w '%{http_code}' "$BASE_URL$path")"
  if [[ "$code" != "$expected" ]]; then
    echo "FAIL $path: expected $expected, got $code" >&2
    cat "$TMP/body" >&2
    exit 1
  fi
  echo "PASS $path ($code)"
}

check /health/live 200
check /health/ready 200
check /api/v1/meta 200
check /login 200
check /dashboard 200

code="$(curl -kLsS -o "$TMP/protected" -w '%{http_code}' "$BASE_URL/api/v1/workspaces")"
[[ "$code" == "401" ]] || { echo "FAIL protected route expected 401, got $code" >&2; cat "$TMP/protected" >&2; exit 1; }
echo "PASS unauthenticated workspace protection (401)"
echo "Smoke tests passed."
