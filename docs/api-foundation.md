# API foundation

Task Genie uses a Fastify TypeScript API under `/api/v1` and Better Auth under `/api/auth/*`.

## Conventions

- Browser authentication uses HttpOnly cookies.
- Protected routes return 401 without a session and 403 when the session lacks permission.
- Tenant routes include `workspaceId`; project and task access is checked separately.
- Request bodies, route parameters, and query strings are validated with Zod.
- Errors include a request ID suitable for sanitized log correlation.

```json
{
  "error": "VALIDATION_ERROR",
  "message": "Request validation failed",
  "details": [],
  "requestId": "..."
}
```

## Public endpoints

- `GET /health/live`
- `GET /health/ready`
- `GET /api/v1/meta`
- `GET|POST /api/auth/*`

The route inventory is maintained in `docs/API.md`. The route-module Zod schemas are authoritative until generated OpenAPI documentation is added.
