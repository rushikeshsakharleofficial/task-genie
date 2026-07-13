# Contributing to Task Genie

Task Genie is an early open-source beta. Keep changes small, testable, and compatible with the single-VPS architecture.

## Development requirements

- Node.js 22+
- npm 10+
- Docker with Compose for PostgreSQL and Valkey testing

## Workflow

1. Create a focused branch.
2. Add or update tests for behavior changes.
3. Run:

```bash
npm ci
npm run typecheck
npm test
npm run build
```

4. For database changes, generate and inspect migrations:

```bash
npm run db:generate
```

5. Never commit `.env`, credentials, database dumps, uploads, or generated runtime data.

## Architecture rules

- PostgreSQL is the durable source of truth.
- Valkey may hold only expiring or rebuildable data.
- Every tenant-owned query must be scoped by workspace and authorization.
- Do not introduce microservices, Kubernetes, or mandatory hosted dependencies.
- New frontend behavior must include loading, empty, error, and permission-denied states.

## Security reports

Do not file public issues for vulnerabilities. Follow `SECURITY.md`.
