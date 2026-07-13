$domain = if ($env:TASKGENIE_DOMAIN) { $env:TASKGENIE_DOMAIN } else { "localhost" }

if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "Generating secrets and setting domain to: $domain"
    
    @'
import sys, secrets
from pathlib import Path
p = Path('.env')
s = p.read_text(encoding='utf-8')
domain = sys.argv[1]
pg = secrets.token_urlsafe(36)
vk = secrets.token_urlsafe(36)
auth = secrets.token_urlsafe(64)
s = s.replace('tasks.example.com', domain)
s = s.replace('replace-with-a-long-random-password', pg, 1)
s = s.replace('replace-with-a-long-random-password', pg, 1)
s = s.replace('replace-with-a-long-random-password', vk, 1)
s = s.replace('replace-with-a-long-random-password', vk, 1)
s = s.replace('replace-with-at-least-32-random-bytes', auth)
p.write_text(s, encoding='utf-8')
'@ | python - "$domain"
    Write-Host "Created .env for domain: $domain"
} else {
    Write-Host "Using existing .env"
}

# Verify no placeholders remain
$envContent = Get-Content ".env" -Raw
if ($envContent -match 'replace-with-' -or $envContent -match 'tasks\.example\.com') {
    Write-Error "Refusing to start: replace placeholder secrets/domain in .env"
    exit 1
}

Write-Host "Validating docker compose configuration..."
docker compose config --quiet
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Building Docker images..."
docker compose build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Starting PostgreSQL, Valkey, and ClamAV. Initial ClamAV signature loading can take several minutes..."
docker compose up -d postgres valkey clamav
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Running database migrations..."
docker compose run --rm migrate
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Starting API, worker, web, and caddy..."
docker compose up -d api worker web caddy
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Waiting for services..."
$ready = $false
for ($i = 1; $i -le 120; $i++) {
    $check = docker compose exec -T api node -e "fetch('http://127.0.0.1:4000/health/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))" 2>$null
    if ($LASTEXITCODE -eq 0) {
        $ready = $true
        break
    }
    Start-Sleep -Seconds 5
}

if ($ready) {
    Write-Host "Task Genie is ready."
    docker compose ps
} else {
    docker compose ps
    Write-Error "Services did not become ready; inspect: docker compose logs --tail=200"
    exit 1
}
