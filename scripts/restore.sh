#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
BACKUP="${1:-}"
[[ -n "$BACKUP" && -d "$BACKUP" ]] || { echo "Usage: $0 /path/to/backup-directory" >&2; exit 1; }
[[ -f "$BACKUP/postgres.dump" && -f "$BACKUP/uploads.tar.gz" ]] || { echo "Backup files missing" >&2; exit 1; }
[[ -f .env ]] || { echo ".env is missing" >&2; exit 1; }
set -a; source .env; set +a

if [[ "${TASKGENIE_RESTORE_CONFIRM:-}" != "RESTORE" ]]; then
  echo "This replaces the current database and uploads." >&2
  echo "Run with: TASKGENIE_RESTORE_CONFIRM=RESTORE $0 '$BACKUP'" >&2
  exit 1
fi

(cd "$BACKUP" && sha256sum -c SHA256SUMS)
docker compose up -d postgres valkey
docker compose stop api worker web || true

echo "Restoring PostgreSQL..."
docker compose exec -T postgres dropdb -U "$POSTGRES_USER" --if-exists "$POSTGRES_DB"
docker compose exec -T postgres createdb -U "$POSTGRES_USER" "$POSTGRES_DB"
docker compose exec -T postgres pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-acl < "$BACKUP/postgres.dump"

echo "Restoring uploads..."
docker compose run --rm --no-deps api sh -lc 'rm -rf /app/uploads/* && tar -C /app/uploads -xzf -' < "$BACKUP/uploads.tar.gz"

docker compose up -d api worker web caddy
./scripts/smoke-test.sh
