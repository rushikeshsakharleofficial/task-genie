# Release validation — 0.4.0

Validated on 2026-07-13 in the build environment.

## Passed

- API TypeScript type check
- Web TypeScript type check
- 12 automated tests across slug behavior, application security/public routes, ClamAV response parsing, realtime privacy, and clean PostgreSQL migration application
- API bundle build
- Worker bundle build
- Migration, demo-seed, and legacy-attachment rescan bundle builds
- Next.js production build
- HTTP 200 from the standalone Next.js server for login, onboarding, invitation acceptance, dashboard, my tasks, projects, analytics, inbox, team, posts/emails, and settings
- Drizzle schema generation reported no uncommitted migration changes
- Docker Compose YAML parsed with all eight expected services, including private ClamAV
- all shell scripts passed `bash -n`

## Not executable in this environment

Docker Engine was unavailable, so the complete Compose stack, real PostgreSQL TCP connection, real Valkey connection, Caddy certificate issuance, persisted upload volume, and backup/restore scripts must be tested manually using `docs/TESTING.md`.

## Dependency audit

No high or critical advisory was reported. Seven moderate advisories remain in Next.js/PostCSS and Drizzle/esbuild-related dependency chains. The offered automatic fixes require breaking downgrades and were not applied blindly. Recheck before public deployment.


## 0.4.0 additions

- Verify ClamAV container health and API readiness.
- Verify EICAR upload rejection and fail-closed scanner outage behavior.
- Verify authenticated WebSocket connection, task subscription authorization, privacy-safe event filtering, presence, heartbeat, and reconnect.
- Verify no billing/payment code or external payment dependency is included.
