# Security policy

Task Genie `0.4.0` is an open-source beta. Complete the deployment, authorization, WebSocket, ClamAV, backup/restore, and manual tests in `docs/TESTING.md` before exposing it to untrusted public traffic.

## Reporting vulnerabilities

Do not publish exploitable details in a public issue. Use a private GitHub security advisory when the repository is available, or contact the repository owner privately.

Include the affected version/commit, reproducible request or workflow, role/workspace/task context, impact, and suggested mitigation.

## Implemented controls

- Argon2id password hashing through Better Auth
- HttpOnly cookie sessions
- workspace RBAC, private-project checks, and task authorization
- cross-workspace reference validation
- browser mutation-origin enforcement
- global HTTP rate limiting and WebSocket message-rate limiting
- Zod request and realtime-message validation
- authenticated WebSocket upgrades
- task-scoped realtime subscriptions and privacy-safe generic refresh events
- WebSocket heartbeat, reconnect, payload limit, and origin validation
- ClamAV scanning before attachment persistence
- fail-closed upload behavior by default
- infected upload rejection with no file persistence
- legacy/unscanned attachment download denial until rescan
- upload path/size/type/checksum controls
- secret and credential redaction in logs
- PostgreSQL, Valkey, and ClamAV isolated on the Docker network
- Caddy HTTPS/WSS and baseline security headers
- optimistic task-version conflict checks

## Operator responsibilities

- keep `CLAMAV_ENABLED=true` and `CLAMAV_FAIL_OPEN=false` in production
- confirm ClamAV signatures update successfully and monitor scanner readiness
- run `./scripts/rescan-attachments.sh` after upgrading old installations
- use unique production secrets and `chmod 600 .env`
- restrict SSH and disable password login
- keep the VPS, Docker, images, and dependencies updated
- configure encrypted offsite backups and perform restore drills
- monitor disk, memory, database, Valkey, ClamAV, certificates, worker failures, and backup age
- never publish the upload directory or ClamAV TCP port

## Known gaps

- no MFA or passkeys
- no external penetration test
- no full file-content disarm/reconstruction or sandbox execution
- ClamAV is signature/heuristic scanning, not a guarantee that every malicious file is detected
- no per-route abuse tuning beyond current global and realtime limits
- no real SMTP delivery or bounce processing
- no CRDT/OT rich-text co-editing; realtime currently synchronizes resource events and presence
- no automated container image scanner in the included CI
- moderate advisories may remain in build/development dependency chains; production high/critical findings must be reviewed before release

Security claims apply only after the provided tests pass in your environment.
