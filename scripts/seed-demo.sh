#!/usr/bin/env bash
set -euo pipefail
EMAIL="${1:-}"
[[ -n "$EMAIL" ]] || { echo "Usage: $0 registered-user@example.com" >&2; exit 1; }
DEMO_USER_EMAIL="$EMAIL" docker compose run --rm api node apps/api/dist/db/seed.js
