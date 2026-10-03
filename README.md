# OpsFlow

OpsFlow is an internal **Operations Work Management Platform**. It replaces operational work that otherwise lives in chat, spreadsheets, and email with a single system for creating work, assigning owners, enforcing workflow, collaborating, and keeping an auditable history.

This is not a generic todo app. The product is intentionally smaller than a full Jira clone so the important behaviours — authorization, optimistic concurrency, idempotent mutations, transactional assignment, audit + outbox, and server-side search — can be implemented correctly.

## Architecture

```
apps/web   React + Vite SPA (TanStack Query)
apps/api   Express REST API + outbox worker
packages/shared   Zod contracts, enums, workflow rules
prisma     PostgreSQL schema, migrations, seed
```

The API is the source of truth. The browser never holds authoritative work-item state. Mutations go through PostgreSQL transactions that update the work item, write an audit row, and enqueue an outbox event together.

```
Browser  →  Express/policies  →  Prisma transaction
                                      ├─ WorkItem (versioned)
                                      ├─ AuditLog
                                      └─ OutboxEvent
Background worker  →  Notifications (idempotent by sourceEventId)
```

## Technology stack

- Frontend: React, TypeScript, Vite, Tailwind CSS, React Router, TanStack Query, React Hook Form, Zod, Lucide, Recharts
- Backend: Node.js, Express, Zod, Pino
- Database: PostgreSQL 16 + Prisma
- Auth: bcrypt password hashes, JWT in an httpOnly cookie (Bearer tokens also accepted for tests)
- Tests: Vitest, Supertest, React Testing Library

## Features

- Login / logout / current user
- Role-aware teams (ADMIN, TEAM_LEAD, MEMBER)
- Work items with type, status, priority, assignee, due date
- Server-side list filters, search, sort, pagination, URL-persisted query params
- Dashboard aggregations (never loads the full catalog)
- Comments, activity timeline, notifications
- Optimistic concurrency (`version` + HTTP 409)
- Idempotency keys on assign/approve/status
- Transactional assignment races
- Explicit workflow transitions
- Outbox worker for notifications

## Folder structure

```
/apps/web/src/{components,pages,features,hooks,lib,stores,types}
/apps/api/src/{controllers,services,repositories,middleware,routes,policies,workers,utils}
/packages/shared
/prisma
```

Services currently own data access (repositories are not split into extra files because Prisma already is the query layer). Policies live in `apps/api/src/policies`.

## Environment variables

Copy `.env.example` to `.env` (already present for local demo):

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Signing key for sessions |
| `JWT_EXPIRES_IN` | Token lifetime |
| `PORT` | API port (default `4000`) |
| `CLIENT_ORIGIN` | SPA origin for CORS |
| `COOKIE_SECURE` | Set `true` behind HTTPS |
| `LOG_LEVEL` | Pino level |
| `NODE_ENV` | `development` / `test` / `production` |

## Database setup

PostgreSQL is provided by Docker:

```bash
npm install
npm run db:up
```

Wait until the container is healthy, then:

```bash
npx prisma migrate dev --name init
npm run db:seed
```

If you already have a migrated database:

```bash
npx prisma migrate deploy
npm run db:seed
```

## How to start

Terminal 1 — API (also starts the outbox worker):

```bash
npm run dev:api
```

Terminal 2 — web app:

```bash
npm run dev:web
```

Or both:

```bash
npm run dev
```

- Web: http://localhost:5173
- API health: http://localhost:4000/api/health

## Tests

```bash
npm test
```

API tests require PostgreSQL (`DATABASE_URL`). They create isolated users/teams/items and cover concurrency, idempotency, authorization, workflow, assignment races, audit, and outbox retries.

## Demo accounts

Password for every seeded user: `Password123!`

| Email | Role |
| --- | --- |
| `admin@opsflow.local` | Platform admin |
| `ananya@opsflow.local` | Support / Ops team lead |
| `rahul@opsflow.local` | Engineering team lead |
| `priya@opsflow.local` | Member (Support + Ops) |
| `isolated@opsflow.local` | Member of Restricted Audit Cell only |

## API overview

- `POST /api/auth/login` `POST /api/auth/logout` `GET /api/auth/me`
- `GET/POST /api/work-items` `GET/PATCH /api/work-items/:id`
- `POST /api/work-items/:id/assign` (Idempotency-Key)
- `POST /api/work-items/:id/status|priority|approve|reject|request-approval|reopen|close`
- `GET/POST /api/work-items/:id/comments`
- `GET /api/work-items/:id/activity`
- `GET /api/users` `GET /api/teams` `GET /api/teams/:id/members`
- `GET /api/notifications` `POST /api/notifications/:id/read`
- `GET /api/dashboard/summary` `GET /api/activity`

Errors:

```json
{ "error": { "code": "VERSION_CONFLICT", "message": "...", "details": {} } }
```

## Concurrency approach

Work items carry an integer `version`. Updates use `UPDATE ... WHERE id = :id AND version = :expectedVersion`. Zero rows becomes HTTP 409 `VERSION_CONFLICT`. Claiming an unassigned item also requires `assigneeId IS NULL` so two simultaneous assigns cannot both succeed.

## Authorization approach

Every work-item route loads the item and checks team membership on the server. Admins can do everything. Team leads manage their team. Members can view team work, update items assigned to them, and comment. Changing a UUID in the URL cannot bypass team scope.

## Engineering reliability demos

See [ENGINEERING_DECISIONS.md](./ENGINEERING_DECISIONS.md) and Settings in the app.

### Demo A — Concurrent edit

1. Log in as admin in two browsers.
2. Open the same work item.
3. Change the title in browser A and save.
4. Change the title in browser B and save.
5. Browser B receives 409, a conflict banner, and refreshed server state. Unsaved title remains in the input.

### Demo B — Duplicate operation

```bash
curl -H "Authorization: Bearer $TOKEN" -H "Idempotency-Key: demo-1" -H "Content-Type: application/json" ^
  -d "{\"assigneeId\":\"USER_ID\",\"expectedVersion\":1}" ^
  http://localhost:4000/api/work-items/ID/assign
```

Repeat the same request. The assignment audit is written once.

### Demo C — Authorization

Log in as `priya@opsflow.local`. Request a Restricted Audit Cell work item by id (`GET /api/work-items/:id`). The API returns 403. `isolated@opsflow.local` can open it.

### Demo D — Audit

Change status or priority. The activity timeline shows who changed which field from what to what.

## Known limitations

See [KNOWN_LIMITATIONS.md](./KNOWN_LIMITATIONS.md).
