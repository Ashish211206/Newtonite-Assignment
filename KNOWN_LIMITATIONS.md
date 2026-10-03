# Known limitations

This is a one-day engineering assessment, not a production operations suite. The following were left out on purpose.

- No enterprise SSO / SAML / OIDC. Demo auth is email + password with JWT cookies.
- No Elasticsearch / OpenSearch. Search is PostgreSQL `ILIKE` plus id/name matches.
- Background processing is a single Node interval worker over an `OutboxEvent` table, not Kafka, SQS, or a multi-node queue with poison-pill dashboards.
- No multi-region, no read replicas, no shard strategy.
- No rich text editor, attachments, or issue templates.
- No SLA calendars, on-call integrations, or PagerDuty.
- No email/push/SMS notification delivery — only in-app notification rows.
- No advanced analytics warehouse; dashboard charts are SQL aggregations over accessible teams.
- No real-time websocket invalidation; the UI refetches on mutation and polls notifications.
- Outbox claiming uses a status flip in a transaction rather than `FOR UPDATE SKIP LOCKED` across many worker replicas.
- Mention detection is a simple `@FirstName` scan, not a structured token parser.
- No fine-grained field-level encryption or secret manager integration.
- Seed passwords are public by design (`Password123!`).
- Horizontal scaling of the API is possible, but session revocation is not a central denylist.

The system is meant to be a solid foundation a small team could keep building — not a claim that OpsFlow is complete.
