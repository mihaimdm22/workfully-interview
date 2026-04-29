# ADR 0006 — Orchestrator concurrency, timeouts, and cancellation

**Status:** Accepted

**Context.** Two reviewers (one Codex, one independent Claude subagent) audited
the original orchestrator (`src/lib/fsm/orchestrator.ts` pre-W19') and surfaced
the same set of correctness gaps:

1. `dispatch()` writes the user message, runs the actor, persists the snapshot,
   then maybe records a screening, then writes the bot reply — four separate DB
   trips with no concurrency control between them.
2. Two requests on the same `conversationId` both read the same snapshot, both
   run `actor.send`, and both write — last-writer-wins silently forks the FSM.
3. The 60-second `EVAL_TIMEOUT_MS` lived outside the machine, in the
   orchestrator's `waitFor(actor, ..., { timeout })`. When it fired, the
   in-flight `generateObject` HTTP call to OpenRouter kept running on a
   discarded actor. There was also a fork window: if the LLM resolved at t=59.9s
   and the orchestrator's `waitFor` rejected at t=60s, the FSM transitioned to
   `presentingResult` while the orchestrator returned a "took too long" error.

These are real bugs. They don't fire on the happy path, but the original audit
that produced this ADR explicitly did not have them in scope until both
reviewers flagged them as critical. So we're fixing them as part of W19'.

## Options considered

### A. Pessimistic locking — `SELECT FOR UPDATE` + transaction across writes

```ts
await withTx(async (tx) => {
  const row = await tx.select().from(conversations).where(eq(id, X)).forUpdate();
  // ... actor.start(), actor.send(), waitFor (which calls generateObject) ...
  await tx.update(conversations).set({...}).where(eq(id, X));
});
```

**Pros:** strongest correctness guarantee — the row is locked end-to-end, no
two writers ever see the same version, no race window.

**Cons:** the lock is held across the AI call. With `EVAL_TIMEOUT_MS = 60_000`
and a connection pool of `max: 1` per Vercel Fluid Compute instance (see ADR
0003 + W13), one stuck conversation pins the entire instance for up to 60s.
Concurrent requests on _other_ conversations queue behind it. The reviewers
called this "lock convoying" and "pool starvation"; both rejected it.

### B. Optimistic concurrency — `version` column with compare-and-swap (chosen)

```ts
const { version, fsmSnapshot } = await getConversation(id); // no lock
// ... actor.start(), actor.send(), waitFor() — NO db connection held ...
await updateConversationSnapshotIfVersion(id, newSnapshot, version);
// throws ConcurrentModificationError if someone else won the race
```

**Pros:** no DB connection held during the AI call. The CAS write is one
short `UPDATE` that takes microseconds. Pool stays healthy under any LLM
latency.

**Cons:** the second writer has to handle the conflict. We surface it as a
typed `ConcurrentModificationError`, the action layer maps it to "This
conversation changed in another tab — refresh to continue." The user sees a
recoverable message; the lost LLM call is wasted credit but rare in practice
because the same user rarely fires two screen calls in parallel from one
browser tab.

### Why B over A

The trade-off is correctness-vs-availability. Option A keeps the failure mode
"server appears slow under load." Option B keeps the failure mode "user sees
a refresh prompt in the rare case they double-clicked." For an interview
deliverable that has to demonstrate production-grade judgement, B is the
right call: it shows you understand that database primitives chosen for
short critical sections are catastrophic when the section grows to 60s.

## Timeout policy: in the FSM, not the orchestrator

W19' moves `EVAL_TIMEOUT_MS` from the orchestrator's external `waitFor` into
an XState `after` delayed transition inside the `evaluating` state:

```ts
evaluating: {
  invoke: { src: "screen", ... onDone: ..., onError: ... },
  after: {
    [EVAL_TIMEOUT_MS]: {
      target: "#bot.idle",
      actions: [assign({ error: "AI took longer than 60 seconds." }), ...],
    },
  },
}
```

When `after` fires, XState transitions out of `evaluating` and stops the
invoked promise actor. That actor's `signal` aborts (XState fires it
automatically on actor stop), which — once you wire it through — aborts the
in-flight `generateObject` HTTP call. There is no orchestrator-level race
window because the orchestrator just `waitFor`s a non-evaluating state with no
deadline; the FSM is the single source of truth for "we timed out."

## Cancellation: structural, not best-effort

The orchestrator's `screen` actor used to receive XState's `signal` parameter
and discard it (`if (signal?.aborted) throw`, before calling `screen()`).
Useless: the AI call ran to completion regardless. Now:

```ts
screen: fromPromise(async ({ input, signal }) => {
  const out = await screen(input, { signal });   // forward to AI SDK
  // ...
}),
```

`screen()` accepts an `AbortSignal` in its options and forwards it as
`generateObject({ abortSignal })`. The AI SDK propagates the signal into the
underlying `fetch`, so an aborted signal terminates the HTTP request. When the
FSM's `after` fires (or the user cancels, or the request gets cancelled by
Vercel), the cancellation is structural — not "we hope the network call
finishes soon."

## Migration: expand/contract

Adding a `NOT NULL DEFAULT 0` column to `conversations` is the _expand_ step.
Existing rows backfill to 0. Old code that ignores the column continues to
work — the new code is forward-compatible. Two-phase rollout for production:

1. Ship the migration only (no code change). Verify it lands cleanly in prod.
2. Ship the orchestrator rewrite that reads/writes `version`.

For this branch we ship both in the same PR because it's an interview-scale
deploy with `pnpm db:migrate` running before the new code is exercised. In a
real rolling deploy on Vercel/Neon, two separate releases.

## Test plan

- **Unit (mocked repos):** `src/lib/fsm/orchestrator.test.ts` covers the
  control flow — CAS called with the right `expectedVersion`,
  `ConcurrentModificationError` propagates, AI failure lands in idle, actor
  is stopped on every exit path (W1).
- **Integration (real Postgres):**
  `test/integration/orchestrator.concurrent.test.ts` boots a Testcontainers
  Postgres and exercises the SQL primitive directly: matching version
  succeeds, stale version throws, two concurrent CAS attempts on the same
  expected version produce exactly one winner and one
  `ConcurrentModificationError`.
- **Unit (FSM timeout):** `src/lib/fsm/machine.test.ts` uses
  `vi.useFakeTimers()` to advance past `EVAL_TIMEOUT_MS` and asserts the
  `after` transition fires with the typed error. A second case verifies the
  happy path doesn't trip the timeout.
- **Unit (signal plumbing):** `src/lib/ai/screen.test.ts` asserts that
  `screen(input, { signal })` forwards the same signal instance to the
  underlying model.

## Consequences

- The orchestrator stops being a transactional component. It's a coordinator
  that bundles state-machine progress with idempotent side effects (DB writes,
  log lines).
- The product layer learns about a new error class. The action layer is the
  only place that knows the user-facing string.
- Tests need a Testcontainers lane for the SQL primitive. The unit lane stays
  Docker-free. CI runs both.

## Future work

- A per-conversation in-flight token (Redis or in-memory if single-instance)
  would deflect concurrent dispatch attempts before they hit the DB at all.
  Out of scope for W19'.
- `idle_in_transaction_session_timeout` on the connection string is set
  defensively (see W13 + `.env.example`); the CAS write is short enough that
  this is theoretical safety, not a load-bearing knob.
