# API overview

Base path: `/api/v1`. Browser calls use cookie credentials. Most workspace routes require active membership and a specific permission.

## System and authentication

- `GET /health/live`
- `GET /health/ready` — reports PostgreSQL, Valkey, and ClamAV readiness
- `GET /api/v1/meta`
- `GET /api/v1/me`
- Better Auth handler under `/api/auth/*`

## Real-time WebSocket

Endpoint:

```text
GET /api/v1/workspaces/:workspaceId/realtime
```

Upgrade it to WebSocket using the normal authenticated cookie. In production Caddy proxies the upgrade on the same origin.

Client messages:

```json
{"type":"ping"}
{"type":"subscribe_task","taskId":"<uuid>"}
{"type":"unsubscribe_task","taskId":"<uuid>"}
{"type":"presence","taskId":"<uuid>","state":"viewing"}
{"type":"presence","taskId":"<uuid>","state":"editing"}
{"type":"presence","state":"online"}
```

Server messages include `ready`, `subscribed`, `pong`, `presence`, `event`, and `error`. Task subscription and task presence require `task:read` permission. Task-scoped mutation payloads are not sent to non-subscribers.

## Workspaces

- `GET /api/v1/workspaces`
- `POST /api/v1/workspaces`
- `GET /api/v1/workspaces/:workspaceId`
- `PATCH /api/v1/workspaces/:workspaceId`
- `GET /api/v1/workspaces/:workspaceId/activity`

## Members and invitations

- `GET /api/v1/workspaces/:workspaceId/members`
- `PATCH /api/v1/workspaces/:workspaceId/members/:userId`
- `DELETE /api/v1/workspaces/:workspaceId/members/:userId`
- `GET /api/v1/workspaces/:workspaceId/invitations`
- `POST /api/v1/workspaces/:workspaceId/invitations`
- `POST /api/v1/invitations/accept`

## Projects, statuses, labels, tasks, collaboration, analytics, and content

The existing REST route structure is unchanged in `0.4.0`. Zod route schemas are authoritative until generated OpenAPI is added.

## Attachments and ClamAV

Task attachment routes support list/upload/download/delete. Upload is multipart and limited to one file per request. The API returns:

- `201` when scanning succeeds and the clean file is stored
- `422` when ClamAV identifies malware
- `503` when the scanner is unavailable and fail-closed is enabled

Only clean or explicitly fail-open-accepted attachments can be listed/downloaded. Fail-open is disabled by default.
