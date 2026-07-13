# Changelog

## 0.4.0 — 2026-07-13

### Added

- authenticated workspace WebSocket endpoint
- task-scoped realtime subscriptions and privacy-safe workspace refresh events
- live task/comment/checklist/attachment/member/content updates
- task viewer/editor presence and reconnect handling
- Valkey realtime pub/sub bridge
- WebSocket heartbeat, rate, payload, origin, membership, and permission protections
- ClamAV Docker service and API readiness check
- fail-closed ClamAV INSTREAM scanning before upload persistence
- attachment scan status/result/timestamp database fields
- legacy attachment rescan command
- clean-scan enforcement on attachment listing and download
- ClamAV protocol and realtime privacy tests

### Changed

- recommended VPS memory increased for the ClamAV service
- API metadata and packages updated to 0.4.0
- documentation explicitly excludes billing, subscriptions, and payment systems

## 0.3.0 — 2026-07-13

### Added

- live API-connected frontend with authentication and workspace onboarding
- dashboard, my tasks, projects, analytics, inbox, team, content, and settings pages
- complete core project/task CRUD and tenant-scoped authorization
- comments, checklists, attachments, notifications, invitations, labels, activity, and analytics APIs
- content draft/scheduling data model and simulated worker
- demo seeder
- one-VPS Caddy/Docker Compose deployment
- setup, backup, restore, seed, and smoke-test scripts
- PGlite migration test and API smoke unit tests
- open-source project files and manual testing documentation
