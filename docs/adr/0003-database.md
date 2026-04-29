# ADR 0003 — Database: Postgres + Drizzle ORM

**Status:** Accepted

**Context.** The FSM snapshot, conversation transcript, and screening verdicts
need durable storage. The challenge says "decide what database you need" — the
job description says Acme uses Postgres on AWS RDS with NestJS / TypeScript.

## Options considered

### A. Postgres (chosen)

**Pros:**

- **Matches Acme's stack.** This code could ship to their RDS without a rewrite.
  Mirroring the production stack means I can answer "what would deploy look like"
  with one sentence instead of caveats.
- **JSONB for the FSM snapshot.** XState's `PersistedSnapshot` has nested values
  (`screening.awaitingCv`, parent context, etc.). JSONB indexes well and gives
  us in-database introspection ("which conversations are stuck in `evaluating`?")
  without an ETL pipeline.
- **Relational shape fits the data.** One conversation has many messages and
  zero-or-one screenings. That's a textbook 1:N + 1:0..1 — make it relational
  and the joins are trivial.
- **Mature tooling.** Indexes, transactions, full-text search, cascade deletes
  all out of the box.

**Cons:**

- Needs Docker for local dev. Mitigated by `pnpm db:up` running compose.

### B. SQLite (`better-sqlite3` / libSQL)

**Pros:** zero infra, embedded, fast for a single-process demo.

**Cons:**

- Stack mismatch. I'd have to caveat "in production we'd swap to Postgres" on
  every architectural conversation, which means I haven't actually answered "what
  database for this product."
- libSQL/Turso is great for edge but the demo doesn't need that.
- JSONB-style querying on the snapshot is weaker (SQLite has JSON1 but the
  ergonomics are worse).

### C. Redis only

**Cons:** ephemeral by default; would lose conversations on restart unless we
configure persistence carefully. Also bad fit for the relational
conversation-message-screening shape.

### D. PGlite (Postgres in WASM)

Genuinely cool — Postgres semantics with zero infra. Considered seriously, but
chose the docker-compose route because the production answer for Acme is RDS, not
PGlite, and I want the dev DB to _be_ the production DB rather than emulate it.

## Why Drizzle ORM (not Prisma, not raw SQL)

| Aspect             | Drizzle                      | Prisma                             | Raw SQL (postgres-js) |
| ------------------ | ---------------------------- | ---------------------------------- | --------------------- |
| Type safety        | Inferred from schema         | Generated client                   | Manual                |
| SQL transparency   | Queries look like SQL        | Hidden behind a query builder      | It is SQL             |
| Bundle size        | ~12 KB                       | ~6 MB                              | Small                 |
| Migrations         | `drizzle-kit generate` → SQL | Migration engine, sometimes opaque | Hand-written          |
| Edge-runtime ready | Yes                          | Limited                            | Yes                   |

Drizzle gives us the type safety of Prisma without hiding what's actually being
sent to Postgres. That matters here because: (a) the FSM snapshot is stored as
JSONB and I want to be sure the queries indexing it stay sensible; (b) every
review conversation about query performance ends with "show me the SQL" and
Drizzle code already looks like SQL.

## Schema shape

```text
conversations(id PK, fsm_snapshot JSONB, created_at, updated_at)
   └── messages(id PK, conversation_id FK CASCADE, role ENUM, content, attachment_*, created_at)
   └── screenings(id PK, conversation_id FK CASCADE, jd, cv, result JSONB, model, latency_ms, created_at)
```

Three intentional choices:

1. **`screenings` is denormalized.** The JD and CV text are copied in when a
   verdict is produced. This means editing a JD doesn't retroactively invalidate
   prior screenings — the verdict is reproducible against the inputs the model
   actually saw. Storage cost is trivial relative to the value of an audit trail.
2. **Messages are append-only.** The chat transcript _is_ the audit log for the
   conversation. Combined with `fsm_snapshot` we can replay any conversation.
3. **Indexes on `messages(conversation_id, created_at)` and `screenings(conversation_id)`.**
   Both queries we run on the hot path.

## Concurrency model

Conversations have a `version` integer column that's bumped on every write via
optimistic compare-and-swap. The orchestrator reads `(snapshot, version)`,
runs the AI call outside any transaction, and commits with
`UPDATE ... WHERE id = ? AND version = ?`. If the row was modified in between
(another tab, a duplicate request), the CAS returns zero rows and the
repository throws `ConcurrentModificationError`. Full rationale in
[ADR 0006](./0006-orchestrator-concurrency.md), including why we rejected
`SELECT FOR UPDATE` despite its simpler correctness story.

The connection-pool size also branches on the deploy target (see W13): `max: 1`
on Vercel Fluid Compute, `max: 10` for Docker / long-lived servers. Override
via `MAX_DB_CONNECTIONS`.

## Consequences

- One Docker dependency for local dev. The `docker-compose.yml` is committed.
- Migrations are checked into the repo (`src/lib/db/migrations/`). Drizzle's
  generator produces plain SQL — no opaque migration engine.
- The DB client is a lazy singleton (`src/lib/db/client.ts`). It only connects on
  first query, so `next build` doesn't crash when `DATABASE_URL` is unset.
- Concurrent writes on the same conversation are serialised by version, not by
  row locking — see ADR 0006 for the trade-off.

## Why this answers the interview question

> "What database did you use and why?"

Postgres because it's what Acme runs in production — every architectural
conversation about scaling, indexing, or backups stays grounded in real ops, not
"in production we'd switch to ...". Drizzle because the type safety is on par
with Prisma but the SQL stays transparent, which matters for a service that
stores JSONB snapshots and where query plans are inspectable from day one.
