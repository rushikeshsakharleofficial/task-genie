#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
[[ -f .env ]] || { echo ".env is missing" >&2; exit 1; }
set -a; source .env; set +a

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="${1:-$ROOT/backups/$STAMP}"
mkdir -p "$DEST"
chmod 700 "$DEST"

echo "Backing up PostgreSQL..."
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-acl > "$DEST/postgres.dump"

echo "Backing up uploads..."
docker compose exec -T api tar -C /app/uploads -czf - . > "$DEST/uploads.tar.gz"

cp .env.example "$DEST/env.template"
sha256sum "$DEST/postgres.dump" "$DEST/uploads.tar.gz" > "$DEST/SHA256SUMS"
chmod 600 "$DEST/postgres.dump" "$DEST/uploads.tar.gz" "$DEST/SHA256SUMS"

echo "Backup created: $DEST"
echo "Copy it to encrypted offsite storage. A backup on the same VPS is not sufficient."
