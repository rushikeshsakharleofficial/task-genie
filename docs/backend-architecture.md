# Backend architecture

## Deployment boundary

Task Genie targets one VPS and remains a modular monolith.

```text
Caddy
 ├─ Next.js web
 └─ Fastify HTTP + WebSocket API
      ├─ PostgreSQL 16
      ├─ Valkey 9
      ├─ ClamAV 1.5
      └─ private attachment volume

Worker
 ├─ PostgreSQL scheduled content
 └─ Valkey distributed lock
```

## Data ownership

PostgreSQL is authoritative for identity, memberships, permissions, projects, tasks, comments, checklists, notifications, activity, content drafts, attachment metadata, and scan results.

Valkey is non-authoritative. It is used for Better Auth secondary storage, rate-limit state, locks, and realtime pub/sub. Losing Valkey must not delete product data.

Attachments live in a private Docker volume. The API scans the complete upload buffer through ClamAV INSTREAM before writing it. Only records with `clean` or explicitly accepted fail-open status can be listed or downloaded. Production defaults to fail-closed, so accepted fail-open status should not normally occur.

## Realtime sequence

1. Browser opens `wss://<host>/api/v1/workspaces/:workspaceId/realtime` with its existing session cookie.
2. The API validates Origin, session, active workspace membership, payload size, and message rate.
3. A client may subscribe to a task only after `task:read` authorization succeeds.
4. Mutating API routes publish sanitized resource events through Valkey.
5. Task payloads are sent only to authorized task subscribers.
6. Other workspace clients receive a generic refresh event with no private task fields.
7. Presence is ephemeral and only visible to task subscribers.
8. Heartbeats terminate dead sockets; the browser reconnects with exponential backoff and replays active subscriptions.

This is resource synchronization and presence, not character-level CRDT editing.

## Attachment scan sequence

1. Multipart size and declared type/extension are validated.
2. The file is buffered within `MAX_UPLOAD_BYTES`.
3. SHA-256 is calculated.
4. The buffer is streamed to `clamd` using INSTREAM.
5. `FOUND` rejects the request with 422 and writes no file.
6. Scanner error returns 503 when fail-closed.
7. A clean file is written with restrictive permissions and scan metadata is stored.
8. Download requires task authorization, non-quarantine state, and an accepted scan status.

## Authorization sequence

1. Resolve session.
2. Validate route/query/body.
3. Resolve workspace membership.
4. Check role permissions.
5. For private projects, require explicit project membership.
6. Resolve and authorize task parent project.
7. Validate referenced records against the same tenant/resource.
8. Execute workspace-scoped queries.

Object IDs alone never grant access.

## Reliability model

One VPS is one failure domain. Recovery relies on container health checks, PostgreSQL transactions, migrations, optimistic task versions, Valkey locks, persistent ClamAV signatures, database/upload backups, and documented restore/rollback procedures.
