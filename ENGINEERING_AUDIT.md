# Engineering Audit: OpsFlow

This document presents a comprehensive audit of the OpsFlow codebase against the **Newtonite Software Engineering Challenge** requirements, evaluating the initial implementation received from Cursor and documenting all fixes, additions, and verifications completed.

---

## Requirements Audit Matrix

| Requirement | Status | Existing Implementation | Required Work / Changes Made |
|---|---|---|---|
| **Authentication** | ✅ | Password hashing via `bcryptjs`, JWT token signing, httpOnly cookie & Bearer token support, `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`. | Kept existing implementation. Verified login/logout flows and session extraction. |
| **Authorization (Resource-Level)** | ✅ | Policy module (`workItemPolicy.ts`) enforcing team-scoped access for platform `ADMIN`, `TEAM_LEAD`, and `MEMBER` roles. Server-side checks on all routes. | Verified server-side policy enforcement. Members guessing work item IDs outside their assigned teams receive HTTP 403 Forbidden. |
| **Work Items Management** | ✅ | Full CRUD lifecycle: title, description, type, priority, team, assignee, due date, status. | Verified schema and service methods for creation, retrieval, patching, and status updates. |
| **Optimistic Concurrency (OCC)** | ✅ | `WorkItem.version` field. Conditional SQL update (`WHERE id = :id AND version = :expected`). Returns HTTP 409 `VERSION_CONFLICT` on stale updates. | Verified backend and UI conflict handling banner that refetches current state while preserving user's unsaved edits. |
| **Idempotency & Duplicate Requests** | ✅ | `IdempotencyRecord` model and `withIdempotency` middleware storing request SHA-256 hashes and responses for mutation routes (`assign`, `status`, `approve`). | Verified key deduplication. Repeating a mutation with the same `Idempotency-Key` returns the stored result without re-executing side effects. |
| **Concurrent Assignment Races** | ✅ | Conditional update specifying `assigneeId = null` when claiming unassigned work. Rejects simultaneous claims with HTTP 409 `ASSIGNMENT_CONFLICT`. | Verified backend handling of simultaneous claim races so only one user succeeds. |
| **Audit Log & History** | ✅ | `AuditLog` table capturing actor, action, entity, field-level diffs, and timestamp within the primary mutation transaction. `/api/work-items/:id/activity` and `/api/activity`. | Verified audit events created for all state transitions, comments, and assignments. |
| **Workflow Transition Rules** | ✅ | State machine map (`ALLOWED_STATUS_TRANSITIONS`) defining valid status transitions. Rejects invalid skips (e.g. `WAITING_FOR_APPROVAL` → `CLOSED`) with HTTP 400 `INVALID_WORKFLOW`. | Enforced server-side in `workItemService.ts`. Verified with automated integration test. |
| **Server-Side Search** | ✅ | Multi-column search over title, description, team name, assignee name, and numeric `OPS-` key parser (`parseWorkNumber`). | Pushed all search logic to indexed PostgreSQL queries. Does not load dataset into Node memory. |
| **Filtering, Sorting & Pagination** | ✅ | `workItemListQuerySchema` supporting `status`, `priority`, `type`, `teamId`, `assigneeId`, `due`, `mine`, `sort`, `order`, `page`, `pageSize`. | Pushed offset pagination and filtering to SQL. SPA reflects filters in URL query parameters. |
| **Notifications & Outbox Worker** | ✅ | `OutboxEvent` transactional outbox table and background worker (`outboxWorker.ts`). `sourceEventId` constraint prevents duplicate notifications. | Fixed worker type issues. Verified idempotent event processing and notification creation. |
| **Database Performance & Scale** | ✅ | Indexes on `[teamId, status]`, `[assigneeId, status]`, `[priority, status]`, `[status, priority, dueDate]`, `[createdAt]`, `[updatedAt]`, `[title]`. | Verified query execution plans use composite indexes for tens of thousands of work items. |
| **Error Handling** | ✅ | Standardized error payload structure `{ error: { code, message, details } }` across all endpoints with Zod and AppError middleware. | Fixed TypeScript error code enum index type definition in `@opsflow/shared`. |
| **Testing** | ✅ | Automated Vitest test suite (`correctness.test.ts` & `LoginPage.test.tsx`) covering OCC, idempotency, authorization, workflow rules, assignment races, audit logs, and outbox retries. | Fixed `React.forwardRef` component ref-passing bug in UI `Field.tsx` and resolved TypeScript build errors. All 8 tests pass cleanly. |
| **Documentation** | ✅ | `README.md`, `ENGINEERING_DECISIONS.md`, `KNOWN_LIMITATIONS.md`, and `ENGINEERING_AUDIT.md`. | Completed comprehensive documentation detailing trade-offs, architecture, and running instructions. |

---

## Non-Trivial Correctness Scenarios

1. **Optimistic Concurrency Control (Stale Updates)**
   - **Mechanism:** `UPDATE work_items SET ..., version = version + 1 WHERE id = $1 AND version = $2`
   - **Result:** If another user modified the record in the interim, `version` does not match, 0 rows are affected, and the server returns HTTP 409 `VERSION_CONFLICT`.

2. **Accidental Duplicate Operation Prevention (Idempotency Keys)**
   - **Mechanism:** `Idempotency-Key` HTTP header hashed with request payload and stored in `IdempotencyRecord`.
   - **Result:** Submitting duplicate requests (e.g. network retry on `POST /assign`) returns the previously generated response without re-triggering audit logs or outbox events.

3. **Atomic Self-Assignment Race Handling**
   - **Mechanism:** When claiming an unassigned work item, the conditional query enforces `WHERE id = $1 AND version = $2 AND assigneeId IS NULL`.
   - **Result:** If two users attempt to claim the item simultaneously, only one succeeds; the second receives an `ASSIGNMENT_CONFLICT` 409 response.

4. **Workflow Transition State Machine**
   - **Mechanism:** `ALLOWED_STATUS_TRANSITIONS` lookup enforced in `workItemService.ts`.
   - **Result:** Direct jumps (e.g., `OPEN` → `RESOLVED` without approval/in-progress steps) are blocked server-side with HTTP 400 `INVALID_WORKFLOW`.

5. **Strict Resource-Level Server Authorization**
   - **Mechanism:** Every request evaluates `workItemPolicy.ts` against the authenticated user's `TeamMembership` and global roles.
   - **Result:** Non-members attempting to access URL routes for restricted team items receive HTTP 403 `FORBIDDEN` regardless of UI state.
