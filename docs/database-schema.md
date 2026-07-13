# Database schema

The committed migrations create 26 PostgreSQL tables.

## Authentication

- `user` — user identity and account state
- `session` — Better Auth sessions
- `account` — password or OAuth account credentials
- `verification` — expiring verification records

Passwords are stored only as Argon2id hashes in `account.password`. Valkey never stores passwords or password hashes.

## Tenant and membership

- `workspaces`
- `workspace_members`
- `workspace_invitations`
- `teams`
- `team_members`

Workspace roles are fixed for the first release: `owner`, `admin`, `member`, and `guest`.

## Projects and workflow

- `projects`
- `project_members`
- `workflow_statuses`
- `labels`

A private project is visible only to explicit project members. Workspace projects are visible to active workspace members.

## Tasks and collaboration

- `tasks`
- `task_assignees`
- `task_labels`
- `task_dependencies`
- `checklists`
- `checklist_items`
- `comments`
- `attachments`
- `saved_views`
- `notifications`

Task numbers are unique inside each project. Task creation increments the project counter in the same PostgreSQL transaction.

## Content

- `content_items` — task-linked email, social, and announcement drafts/schedules

## Auditability

- `activities` — human-facing activity stream for implemented task/workspace mutations
- `audit_logs` — security and administration history schema reserved for broader privileged-event coverage

## Tenant-isolation rules

1. Every tenant-owned root record includes `workspace_id`.
2. Routes verify active workspace membership before querying business data.
3. Private projects additionally require a `project_members` record.
4. Parent tasks and workflow statuses are validated against both workspace and project.
5. Foreign keys prevent orphaned references.
6. Composite and partial indexes support workspace-scoped queries.

## Source of truth

PostgreSQL is authoritative. Valkey stores only expiring and rebuildable data such as session acceleration, counters, caches, and scheduler locks and future queues.


## Attachment malware-scan fields

`attachments` includes `scan_status`, `scan_result`, and `scanned_at`. Download/list operations require a non-quarantined record with an accepted scan status. Existing records upgraded from 0.3.0 receive `pending` and must be processed with `scripts/rescan-attachments.sh`.
