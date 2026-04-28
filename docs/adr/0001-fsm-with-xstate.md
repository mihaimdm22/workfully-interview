# ADR 0001 — FSM implementation: XState v5

**Status:** Accepted

**Context.** The challenge requires a finite state machine with three states
(`IDLE`, `SCREENING`, `JOB_BUILDER`), each with their own transitions and a
universal `/cancel`. Screening has internal steps (await JD → await CV → evaluate
→ present). The conversation has to survive page reloads.

## Options considered

### A. Hand-rolled discriminated union + reducer

```ts
type State =
  | { kind: 'idle' }
  | { kind: 'screening', step: 'awaitingJD' | 'awaitingCv' | ... }
  | { kind: 'jobBuilder' };

function reduce(state: State, event: Event): State { ... }
```

**Pros:** zero deps, you can read the whole machine in 50 lines.

**Cons:** every transition is hand-rolled — guards, side-effects (the AI call),
parent-level transitions (`/cancel` from any sub-state) all need to be re-implemented.
Snapshot persistence has to be designed from scratch. By the time you've added these,
you've poorly re-implemented half of XState.

### B. XState v5 (chosen)

**Pros:**

- **Statecharts > state machines.** Hierarchical states make `/cancel` from any
  screening sub-state a one-line transition on the parent. Same for `RESET`.
- **`PersistedSnapshot` is a published API.** `actor.getPersistedSnapshot()` →
  serialize → DB → `createActor(machine, { snapshot })` round-trips cleanly. No
  custom serializer to maintain.
- **Actors for async work.** The AI call is modelled as an `invoke`d actor. The
  FSM transitions to `evaluating`, the actor runs, and the FSM moves to
  `presentingResult` on success or `idle` on error — all declarative.
- **`machine.provide({ actors })`.** The screening actor is _defined_ in the
  machine but _implemented_ per call site. Tests pass a fake actor; production
  passes the real one. Same machine.
- **Visualizer.** `npx xstate visualize src/lib/fsm/machine.ts` (via the Stately
  Studio extension) renders a navigable diagram, useful for the demo.

**Cons:**

- 36 KB minified runtime overhead. Acceptable for a server-side state machine.
- The `setup({ types, actions, actors, guards })` ceremony is verbose. Worth it
  for the type inference.

### C. Robot3 / `@nanostores/state`

Smaller surface than XState but neither has first-class hierarchical states or
persisted snapshots, so we'd be back to hand-rolling those.

## Decision

XState v5. The combination of hierarchical states + persisted snapshots + provided
actors maps so cleanly onto this challenge's requirements that any other choice
would mean rebuilding those features.

## Consequences

- One new dep (`xstate@5`, `@xstate/react@6`).
- The screening actor's _implementation_ is in the orchestrator
  (`src/lib/fsm/orchestrator.ts`), not in the machine. This keeps the machine
  importable from tests and the React UI without dragging server dependencies in.
- Snapshot validation happens at the DB boundary via Zod
  (`src/lib/fsm/snapshot.ts`) — if a row is malformed, callers can choose to start
  fresh rather than crash.

## Why this answers the interview question

> "How did you decide to implement the state machine?"

Three reasons it's XState rather than a hand-roll:

1. The challenge has hierarchical states (`/cancel` from any screening sub-state).
   Statecharts make that a one-liner; without them you wire it on every leaf.
2. The conversation has to be resumable across reloads. `getPersistedSnapshot()` /
   `createActor({ snapshot })` is a published, tested round-trip. Hand-rolling a
   serializer for arbitrary union types is exactly the kind of "small task that
   eats a day" that I'd want a library for.
3. The async screening call belongs _inside_ the machine (it's a state that has
   work-in-progress, not a fire-and-forget side effect). Modelling it as an
   `invoke`d actor with `onDone` / `onError` keeps the success and failure paths
   declarative — and lets tests swap the actor for a fake without touching the
   machine.
