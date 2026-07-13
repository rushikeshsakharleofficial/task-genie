#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
command -v docker >/dev/null 2>&1 || { echo "docker is required" >&2; exit 1; }
docker compose up -d postgres valkey clamav
docker compose run --rm migrate
docker compose run --rm api node apps/api/dist/db/rescan-attachments.js
