# Task Genie

Task Genie is an open-source, single-VPS task and project management application. It combines a dense SaaS-style interface with a TypeScript API, PostgreSQL, Valkey, authenticated WebSocket collaboration, ClamAV upload scanning, local attachment storage, and Docker Compose.

> **Release status:** `0.4.0` is a self-hosted beta intended for manual testing. It has no billing, subscription, payment gateway, hosted-license, or SaaS metering code by design.

## Implemented product

### Authentication and tenancy

- Email/password signup, signin, signout, and session handling through Better Auth
- Secure HttpOnly cookie sessions and Argon2id password hashing
- Workspace onboarding and workspace switching
- Roles: owner, admin, member, guest
- Workspace and private-project authorization checks
- Invitations with expiring one-time tokens

### Work management

- Projects with visibility, workflow statuses, progress, archive, and delete operations
- Task list/search/filter/sort/pagination
- Task create, read, update, completion, archive, and soft delete
- Priority, dates, assignees, labels, parent tasks, and optimistic version checks
- Comments, checklists, checklist items, attachments, activity, and notifications
- Authorized local attachment download

### Real-time collaboration

- Authenticated workspace WebSocket endpoint
- Live task/comment/checklist/attachment/member/content change events
- Task-scoped subscriptions to avoid leaking private task data
- Live viewer/editor presence in the task drawer
- Automatic reconnect with subscription replay
- Valkey pub/sub bridge, allowing the API and worker model to remain clean even on one VPS
- Heartbeats, payload limits, message-rate limits, origin validation, and permission checks

### Upload security

- Every new attachment is scanned by ClamAV before it is written to the private upload volume
- Infected files are rejected and never persisted
- Scanner failures are fail-closed by default
- Scan status, result, and timestamp are recorded in PostgreSQL
- Legacy/unscanned attachments are hidden from listing and download until rescanned
- A one-shot rescan command is included for upgrades

### User interface

- `/dashboard` — live KPIs, assigned tasks, deadlines, activity, and task drawer
- `/my-tasks` — searchable/filterable task workspace with create/edit flows
- `/projects` — project creation, progress, archive, and navigation
- `/analytics` — live task aggregates and task performance
- `/inbox` — notifications and mark-read workflow
- `/team` — members, roles, suspension/removal, invitations
- `/posts-emails` — task-linked content drafts, scheduling state, editor, and preview
- `/settings` — workspace and runtime information
- `/login`, `/onboarding`, `/accept-invite`

### Operations

- PostgreSQL migrations and demo seeder
- Valkey-backed session/cache support, realtime pub/sub, and scheduler lock
- Simulated scheduled-content worker
- ClamAV daemon with persistent signature database
- Docker Compose deployment behind Caddy
- Backup, restore, setup, seed, rescan, and smoke-test scripts
- Embedded PostgreSQL migration test through PGlite
- CI for type checking, tests, builds, and migration drift

## Architecture

```text
Browser
   │ HTTPS / WSS
Caddy :80/:443
   ├── /api/*, /health/* → Fastify API :4000
   └── everything else  → Next.js web :3000

Fastify API
   ├── PostgreSQL 16  durable product + scan metadata
   ├── Valkey 9      sessions, counters, locks, realtime pub/sub
   ├── ClamAV 1.5    private TCP scanner on Docker network
   └── local volume  clean, authorized attachments

Worker
   ├── PostgreSQL scheduled content
   └── Valkey distributed lock
```

The deployment is deliberately a modular monolith. It does not require Kubernetes, hosted auth, hosted databases, cloud object storage, or payment services.

## Requirements

- Linux VPS or workstation
- Docker Engine with Compose v2
- Recommended production VPS with ClamAV: **4 vCPU, 12 GB RAM, 100 GB NVMe**
- Practical minimum for a small test installation: **4 vCPU, 8 GB RAM**, with swap and careful monitoring
- For source development: Node.js 22+ and npm 10+

ClamAV signature loading can temporarily consume substantial memory. Do not squeeze this stack onto a tiny 2–4 GB production VPS and then act surprised when the kernel kills something.

## Fastest self-hosted installation

For a local HTTP installation:

```bash
git clone <your-repository-url> task-genie
cd task-genie
TASKGENIE_DOMAIN=localhost ./scripts/setup.sh
```

For a public domain, point DNS to the VPS first:

```bash
TASKGENIE_DOMAIN=tasks.example.com ./scripts/setup.sh
```

The first ClamAV startup downloads and loads signatures, so initial readiness can take several minutes.

Inspect services:

```bash
docker compose ps
docker compose logs -f --tail=200 clamav api web
```

Run basic service tests:

```bash
BASE_URL=https://tasks.example.com ./scripts/smoke-test.sh
```

## Upgrade from 0.3.0

After replacing the source and rebuilding:

```bash
docker compose build
docker compose up -d postgres valkey clamav
docker compose run --rm migrate
docker compose up -d api worker web caddy
./scripts/rescan-attachments.sh
```

Until the rescan completes, legacy attachments with no clean scan result remain unavailable. This is deliberate fail-closed behavior.

## First-user workflow

1. Open `/login`.
2. Create an account.
3. Create a workspace on `/onboarding`.
4. Create the first project and tasks.
5. Optionally seed richer demo data after the user exists:

```bash
./scripts/seed-demo.sh user@example.com
```

## Source development

```bash
cp .env.example .env
# Change database/Valkey/ClamAV hosts to localhost for local source processes.
npm ci
npm run db:migrate
npm run dev:api
```

In another terminal:

```bash
npm run dev:web
```

For source development without ClamAV only, set `CLAMAV_ENABLED=false`. Do not use that shortcut in production.

Validation:

```bash
npm run typecheck
npm test
npm run build
```

## Backups and restore

```bash
./scripts/backup.sh
TASKGENIE_RESTORE_CONFIRM=RESTORE ./scripts/restore.sh backups/20260713T120000Z
```

The ClamAV signature volume does not need to be treated as business data; signatures can be downloaded again. PostgreSQL and uploads must be backed up together.

## Security model

- PostgreSQL is the only durable source of truth.
- Valkey stores only expiring/reconstructible state and realtime pub/sub messages.
- PostgreSQL, Valkey, and ClamAV have no public host ports.
- WebSocket upgrades use the existing authenticated session cookie.
- WebSocket origins, workspace membership, task permissions, payload size, and message rate are validated.
- Task-specific realtime payloads only reach clients subscribed to tasks they are authorized to read.
- Uploads are scanned before persistence and downloads require an accepted scan status.
- Mutations reject unexpected browser origins.
- Secrets, cookies, authorization headers, passwords, and tokens are redacted from logs.
- Caddy terminates TLS/WSS and adds baseline security headers.

See `SECURITY.md` and `docs/TESTING.md`.

## Known beta limitations

- Scheduled content is marked sent by a simulation worker; no SMTP provider is connected.
- The editor does not call an AI model.
- Presence is task-level and ephemeral; this is not CRDT collaborative rich-text editing.
- No MFA/passkeys, SAML, SCIM, mobile app, offline sync, or social-network publishing.
- No billing or payment functionality, intentionally.
- No true high availability: one VPS remains one failure domain.
- Docker runtime was not available in the build environment used to assemble this archive, so perform the documented Compose, ClamAV, WebSocket, and manual tests on your VPS.

## Documentation

- `docs/TESTING.md` — manual acceptance sequence, including EICAR and two-browser realtime tests
- `docs/API.md` — route and WebSocket protocol overview
- `docs/backend-architecture.md` — backend, realtime, and scanner design
- `docs/database-schema.md` — data model
- `SECURITY.md` — security guarantees and gaps
- `CONTRIBUTING.md` — contribution requirements

## License

MIT. See `LICENSE`.
