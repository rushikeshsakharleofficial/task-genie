#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

command -v docker >/dev/null 2>&1 || { echo "docker is required" >&2; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "Docker Compose v2 is required" >&2; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "python3 is required" >&2; exit 1; }

if [[ ! -f .env ]]; then
  cp .env.example .env
  DOMAIN="${TASKGENIE_DOMAIN:-localhost}"
  python3 - "$DOMAIN" <<'PY'
from pathlib import Path
import secrets, sys
p=Path('.env')
s=p.read_text()
domain=sys.argv[1]
pg=secrets.token_urlsafe(36)
vk=secrets.token_urlsafe(36)
auth=secrets.token_urlsafe(64)
s=s.replace('tasks.example.com', domain)
s=s.replace('replace-with-a-long-random-password', pg, 1)
s=s.replace('replace-with-a-long-random-password', pg, 1)
s=s.replace('replace-with-a-long-random-password', vk, 1)
s=s.replace('replace-with-a-long-random-password', vk, 1)
s=s.replace('replace-with-at-least-32-random-bytes', auth)
p.write_text(s)
PY
  chmod 600 .env
  echo "Created .env for domain: $DOMAIN"
else
  echo "Using existing .env"
fi

if grep -Eq 'replace-with-|tasks\.example\.com' .env; then
  echo "Refusing to start: replace placeholder secrets/domain in .env" >&2
  exit 1
fi

docker compose config --quiet
docker compose build
echo "Starting PostgreSQL, Valkey, and ClamAV. Initial ClamAV signature loading can take several minutes..."
docker compose up -d postgres valkey clamav
docker compose run --rm migrate
docker compose up -d api worker web caddy

echo "Waiting for services..."
for _ in {1..120}; do
  if docker compose exec -T api node -e "fetch('http://127.0.0.1:4000/health/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))" >/dev/null 2>&1; then
    echo "Task Genie is ready."
    docker compose ps
    exit 0
  fi
  sleep 5
done

docker compose ps
echo "Services did not become ready; inspect: docker compose logs --tail=200" >&2
exit 1
