# Engineering decisions

OpsFlow is designed around correctness under concurrent use, not around feature volume. These five decisions are the ones that most strongly shape the system.

## 1. PostgreSQL + relational modelling

**Problem.** Operational work has relationships (teams, memberships, assignees, comments, audit events) and needs constraints, pagination, and indexed filters at tens of thousands of rows.

**Decision.** PostgreSQL with Prisma. Work items, memberships, comments, audit logs, notifications, outbox events, and idempotency records are normalized tables with foreign keys and indexes on `teamId+status`, `assigneeId`, `dueDate`, `updatedAt`, and notification unread queries.

**Alternatives considered.** A document store (MongoDB) would make nested comments easy but weakens multi-row transactions and constrained membership. Spreadsheets / in-memory arrays fail the scale requirement immediately.

**Trade-offs.** Schema migrations are required when fields change. Joins must be written carefully (Prisma `include` on lists is limited to the current page).

**Why this solution.** The challenge is about consistency and authorization across related entities. A relational database is the least surprising tool for that job, and it lets the API push filtering/sorting to indexes instead of loading the catalog into Node.

## 2. Optimistic concurrency with version numbers

**Problem.** Two operators can open the same incident. Last-write-wins silently drops the first person's triage.

**Decision.** `WorkItem.version` starts at 1. Every mutation sends `expectedVersion`. The update is `UPDATE ... SET version = version + 1 WHERE id = $id AND version = $expected`. If no row is updated, the API returns 409 `VERSION_CONFLICT` with a message telling the client to refresh. The UI shows a banner, refetches, and keeps unsaved title text.

**Alternatives considered.** Pessimistic row locks for the whole edit session would block other readers/writers and do not map well to a web UI. ETags alone without a conditional SQL update can still race.

**Trade-offs.** Clients must retry after refresh. Users cannot blindly save on top of unknown changes — which is the point.

**Why this solution.** OCC matches how internal tools are used (open a ticket, walk away, come back). The database, not the React cache, decides who won.

## 3. Authorization / policy layer

**Problem.** Hiding a button is not security. Members will guess IDs.

**Decision.** `workItemPolicy.ts` is the only place that interprets roles. Platform admins (global role or team ADMIN) bypass team checks. Everyone else must have a `TeamMembership` for the item's `teamId` to view it. Leads can assign, change priority, and approve. Members can update items assigned to them and comment. List endpoints also constrain `teamId IN (accessible teams)`.

**Alternatives considered.** A single `isAdmin` flag on the user table is too coarse. Frontend-only gating is rejected. ReBAC/Zanzibar is disproportionate for a one-day assessment.

**Trade-offs.** Policies must be called on every handler (easy to miss a new route). We keep handlers thin and run policy after load, before mutate.

**Why this solution.** It is explicit, testable, and matches the org structure already in the domain model.

## 4. Transactional mutation + audit + outbox

**Problem.** If we commit a status change and then fail to write history or notify the assignee, operators lose the trail and people miss work.

**Decision.** Each important mutation runs in one Prisma transaction: update work item, insert `AuditLog`, insert `OutboxEvent`. A lightweight in-process worker claims pending events, creates notifications, and marks the event processed. Notification inserts use unique `sourceEventId`, so retries cannot duplicate.

**Alternatives considered.** Notify inside the request (slower, couples email/notification failure to the user action). Kafka/RabbitMQ (operationally heavy for the assessment). Fire-and-forget `setImmediate` without a table (lost on crash).

**Trade-offs.** The worker is a single process — not a clustered queue. At-least-once delivery requires idempotent consumers (which we have).

**Why this solution.** It gives crash safety and a clear story in an interview without pretending we run a distributed log.

## 5. Server-side pagination, search, and filtering

**Problem.** “Load all work items and filter in the browser” collapses at tens of thousands of rows and hides N+1 query problems.

**Decision.** `GET /api/work-items` accepts page, pageSize, q, status, priority, type, team, assignee, due, sort. Search is `ILIKE` / indexed equality on title, description, numeric/OPS- id, assignee name, and team name. The dashboard uses `count` and `groupBy`. The SPA stores filters in the URL (`/work?status=OPEN&priority=CRITICAL&page=2`) and debounces the global search box.

**Alternatives considered.** Elasticsearch for relevance ranking — better later, extra moving part today. Client-side tables with cached full datasets — forbidden by the brief.

**Trade-offs.** Postgres `ILIKE '%term%'` will not be as fast as trigram/GIN at huge scale; we indexed the obvious equality/sort columns and would add `pg_trgm` next.

**Why this solution.** It proves the API is designed for volume, keeps the browser thin, and makes filter state shareable.
