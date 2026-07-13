# Task Genie 0.4.0 Manual Testing Guide

This guide is the acceptance procedure for the self-hosted beta. Record failures with the route, role, request, response code, browser, and relevant logs.

## 1. Clean installation

```bash
TASKGENIE_DOMAIN=localhost ./scripts/setup.sh
docker compose ps
BASE_URL=http://localhost ./scripts/smoke-test.sh
```

Expected:

- PostgreSQL, Valkey, ClamAV, API, worker, web, and Caddy are healthy/running.
- `GET /health/live`, `GET /health/ready`, and `GET /api/v1/meta` return 200; readiness reports PostgreSQL, Valkey, and ClamAV as true.
- Unauthenticated `GET /api/v1/workspaces` returns 401.

Inspect logs for credentials or cookies; none should be printed.

## 2. Authentication

Use a fresh browser profile.

1. Open `/login` and create `owner@example.test` with a strong password.
2. Confirm a session cookie is HttpOnly. With HTTPS and `COOKIE_SECURE=true`, confirm Secure is set.
3. Reload and verify the session remains.
4. Sign out and confirm protected pages redirect to `/login`.
5. Attempt an incorrect password several times and confirm rate limiting eventually applies.
6. Confirm another origin cannot perform a state-changing API request.

## 3. Workspace onboarding

1. Create workspace `Engineering`.
2. Verify it appears in the workspace selector.
3. Create a second workspace and switch between them.
4. Confirm projects/tasks never leak between workspaces.
5. Edit workspace details in Settings.

## 4. Members and invitations

1. As owner, create an invitation for `member@example.test`.
2. Copy the returned invitation token into `/accept-invite` while signed in as that exact email.
3. Verify a different email receives 403.
4. Change member role to guest, member, and admin.
5. Suspend the member and verify access is denied.
6. Attempt to remove or suspend yourself; verify the protected case is rejected.
7. Remove the secondary member.

## 5. Projects

1. Create workspace-visible and private projects.
2. Verify a normal workspace member sees the workspace project.
3. Verify only explicit private-project members can access a private project.
4. Edit project name, key, color, and visibility.
5. Archive and restore behavior according to the UI/API.
6. Confirm deleted projects do not appear in task queries or permission checks.

## 6. Tasks

Create tasks covering every combination:

- no assignee and one/multiple assignees
- all priorities
- all statuses
- due date in past/today/future
- task with labels
- parent and child task

Test:

1. List, search, filter, sort, and paginate.
2. Edit fields and verify the details drawer updates.
3. Submit an old `version` number and expect 409.
4. Reference a status from another project and expect 400.
5. Reference an assignee or label from another workspace and expect 400.
6. Complete and reopen a task.
7. Delete a task and verify it disappears while durable history remains available where designed.
8. As guest, attempt create/update/delete operations and verify permissions.

## 7. Comments, checklists, and notifications

1. Add and delete comments.
2. Verify assignees receive comment/assignment notifications when appropriate.
3. Create a checklist and five items.
4. Complete, edit, reorder where supported, and delete items.
5. Confirm checklist progress updates.
6. Mark notifications read and mark all read.

## 8. Attachments and ClamAV

1. Confirm `docker compose ps clamav` is healthy.
2. Upload allowed small PDF, PNG/JPEG, text, and office-document samples.
3. Verify the response and task drawer show `scanStatus: clean`.
4. Download them as an authorized user.
5. Verify unauthorized workspace/project users cannot list or download them.
6. Exceed `MAX_UPLOAD_BYTES` and expect rejection.
7. Delete an attachment and verify both metadata and disk file are removed.
8. Confirm no upload is directly reachable from a public static path.

### EICAR rejection test

Create the industry-standard harmless antivirus test file in a disposable directory:

```bash
printf '%s' 'X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*' > eicar.com.txt
```

Upload it to an authorized task. Expected:

- HTTP 422
- error states that ClamAV rejected the upload
- no attachment metadata visible
- no file added under the upload volume
- API log contains a sanitized malware-rejection event

Your workstation antivirus may delete the EICAR file immediately; that also confirms the test string is being recognized.

### Fail-closed test

```bash
docker compose stop clamav
```

Upload a clean allowed file. Expected HTTP 503 and no persisted file. Start ClamAV again:

```bash
docker compose start clamav
```

Wait until `/health/ready` returns 200.

### Upgrade rescan test

For data upgraded from 0.3.0:

```bash
./scripts/rescan-attachments.sh
```

Confirm clean legacy files become downloadable, infected test files are removed/quarantined, and scan errors remain unavailable.


## 9. Real-time collaboration and presence

Use two separate browsers or profiles signed in as users authorized for the same task.

1. Open the same task drawer in both browsers.
2. Confirm the top bar shows `Live`.
3. Confirm each user appears as viewing the task in the other browser.
4. Focus an editable task field or comment interaction and confirm editing presence appears.
5. Update the task title/status in browser A; browser B must refresh without a page reload.
6. Add/delete a comment, checklist item, and attachment; browser B must update.
7. Assign a user or mark a notification read and confirm relevant workspace UI refreshes.
8. Stop/restart the API container; the browser should show disconnected/connecting and reconnect automatically.
9. After reconnect, keep the drawer open and confirm task events continue, proving subscription replay.

### Realtime privacy test

1. Create a private project and task.
2. User A is a private-project member; user B is only a workspace member.
3. User B must receive 403 when trying to subscribe to the task ID.
4. When user A edits the private task, user B may receive only a generic workspace refresh event, never the task title, comment text, attachment name, or private task ID payload.
5. Confirm browser B's normal REST refresh still returns only authorized records.

### Origin and abuse test

- Attempt the WebSocket upgrade with a disallowed Origin and expect rejection.
- Send malformed JSON and expect an error message without process failure.
- Exceed `REALTIME_MESSAGES_PER_MINUTE` and expect close code 1008.
- Disconnect a browser without a clean close and confirm heartbeat cleanup removes stale presence.

## 10. Dashboard and analytics

1. Seed demo data if useful: `./scripts/seed-demo.sh owner@example.test`.
2. Verify KPI totals against direct task counts.
3. Confirm Assigned to Me reflects the active user.
4. Complete tasks and verify dashboard/analytics refresh.
5. Verify overdue uses the current server time correctly.
6. Compare status and workload chart totals to raw task data.
7. Test empty workspace behavior.

## 11. Posts & Emails

1. Create email, social, and announcement drafts.
2. Link and unlink a source task.
3. Edit title, subject, body, audience, and status.
4. Schedule a draft a few minutes ahead.
5. Watch worker logs:

```bash
docker compose logs -f worker
```

Expected beta behavior: the worker changes the item to `sent` and logs `mode: simulated`. No email is actually delivered.

## 12. Responsive and accessibility checks

Test at 360, 768, 1024, and 1440 CSS pixels.

- sidebar and task drawer do not trap content
- tables remain usable by scrolling or responsive layout
- forms show visible labels and errors
- keyboard can reach dialogs, menus, fields, and buttons
- focus is visible
- dialog focus returns correctly
- color is not the only status indicator
- browser zoom at 200% remains usable

## 13. Persistence and restart

```bash
docker compose restart api web worker valkey postgres
```

Verify users, workspaces, tasks, uploads, and content persist. Valkey loss must not delete durable product records.

## 14. Backup and restore drill

```bash
./scripts/backup.sh
# Save the printed directory path.
TASKGENIE_RESTORE_CONFIRM=RESTORE ./scripts/restore.sh backups/<timestamp>
```

Perform the restore on a disposable clone first. Verify counts, logins, comments, attachments, and scheduled content afterward.

## 15. Source verification

```bash
npm ci
npm run typecheck
npm test
npm run build
DATABASE_URL=postgresql://taskgenie:password@localhost:5432/taskgenie npm run db:generate
git diff --exit-code
```

Expected packaging baseline:

- TypeScript passes for API and web
- twelve API/migration/realtime/ClamAV tests pass
- API/worker/migration/seed bundles build
- all frontend routes build
- no unexpected migration diff

## Bug report template

```text
Title:
Version/commit:
Environment:
Role/workspace/project:
Steps:
Expected:
Actual:
HTTP status/request ID:
Browser console:
Relevant sanitized logs:
Security impact:
```
