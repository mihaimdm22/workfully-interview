# ADR 0005 — Testing strategy

**Status:** Accepted

**Context.** The challenge calls out testing strategy as something it wants to
see. Many AI-driven apps under-test the bits that are testable (state, schemas,
business rules) and over-test the bits that aren't (the model itself). I want the
opposite.

## What's tested where, and why

```
┌──────────────────────────────────────────────────────────────────────┐
│                         The testing pyramid                          │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│        Playwright (1 happy-path) — exercises UI + Server Action      │
│        Uses WORKFULLY_FAKE_AI=1 for deterministic verdicts           │
│                                                                      │
│   ──────────────────────────────────────────────────────────         │
│                                                                      │
│        Vitest (boundary tests)                                       │
│        - AI service: MockLanguageModelV3 with valid + invalid output │
│        - (Repos: integration via Testcontainers in CI — TODO)        │
│                                                                      │
│   ──────────────────────────────────────────────────────────         │
│                                                                      │
│        Vitest (pure unit) — the bulk of coverage                     │
│        - FSM: every transition, /cancel from each substate, the      │
│          error branch, snapshot rehydration                          │
│        - Intent classifier: every command pattern + content fallback │
│        - Replies: state → prompt mapping is exhaustive               │
│        - Schema: rejects invalid model output                        │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

48 unit tests across 4 files, ~250 ms total.

## The five rules I wrote tests by

1. **Test the FSM, not the framework.** I don't test that XState transitions on
   `actor.send(event)`. I test that _my_ machine, given a sequence of events,
   ends up where the spec says it should. The FSM is mine; XState is theirs.
2. **Test at the boundary, not the implementation.** The AI service tests pass
   in a fake `LanguageModel` and assert behavior on the _output_. They don't
   inspect what prompts got sent — that's coupling tests to implementation.
3. **Mock at the integration point, not deeper.** The screening actor in the FSM
   tests is mocked at the actor level via `botMachine.provide({ actors })`. I
   don't `vi.mock('./screen')`; I provide a different actor. That's how XState
   wants you to do it, and it stays one level above implementation.
4. **One E2E for confidence the wires are connected, not for coverage.** The
   Playwright spec walks through the screening flow and verifies the verdict
   card appears. It doesn't test the verdict's accuracy — that's what the
   schema + boundary tests are for.
5. **Don't test the model's IQ.** Asserting that "Elena Kowalski gets verdict =
   strong" is testing Claude, not my code. The schema test asserts the model's
   output _shape_ is correct; the verdict's _content_ is the model's job.

## What the FSM tests cover (`machine.test.ts`)

- `idle → screening` on `START_SCREENING`
- `idle → jobBuilder` on `START_JOB_BUILDER`
- `screening` substate progression (JD → CV → evaluating → presentingResult)
- Empty-text guard (won't transition on whitespace-only)
- `/cancel` from each screening substate (clears context)
- `/cancel` from jobBuilder
- Actor failure → `idle` with error preserved (regression: `clearScreening`
  used to nuke the error message; the test caught it)
- `/reset` from every screening sub-state (`awaitingJobDescription`, `awaitingCv`,
  `presentingResult`) returns to `idle` and clears verdict
- Re-entering screening from `presentingResult` clears prior verdict
- **Snapshot persistence and rehydration** mid-flow (proves the conversation can
  survive a server restart)

## What the AI service tests cover (`screen.test.ts`)

- Valid model output → typed `ScreeningResult` returned, latency tracked
- Empty JD or CV → throws before calling the model
- Schema-violating model output → throws (so the FSM's error branch fires)

## What's intentionally not tested

- **The OpenRouter / model API.** Their job to test their API. We use `generateObject`
  with a schema, so a wire-format change would surface as a schema-violation
  error which our tests already cover.
- **Drizzle's SQL generation.** Their job. We integration-test the repos against
  a real Postgres in CI (TODO note in repos.ts), not by faking the driver.
- **Tailwind CSS.** No.
- **Verdict accuracy.** That's an evaluation problem, not a unit-test problem.
  The right tool is an offline eval suite over a labeled fixture set, run
  whenever the prompt changes. Not in scope for the challenge but the schema
  - the model column on `screenings` make it straightforward to add.

## Why `WORKFULLY_FAKE_AI=1`

Two reasons:

1. **CI shouldn't depend on OpenRouter uptime or burn budget.** A flaky external
   dependency makes the build flaky.
2. **Determinism for E2E.** A real model returns slightly different text each
   run; asserting on it makes the test brittle. The fake returns the same
   verdict for the same CV, so the Playwright assertion can be precise.

The fake is a transparent ~30-line function in `screen.ts`. It's gated on env
var — production never has `WORKFULLY_FAKE_AI` set, the codepath is dead.

## What I'd add with another day

- **Repository integration tests** with Testcontainers running Postgres in CI.
  The repos are tiny but schema migrations deserve a smoke test.
- **Eval harness.** A `pnpm eval` that runs the fixture CVs against the real
  prompt and a labeled rubric, reports a pass rate over a sample. Run on prompt
  changes.
- **Visual regression** on the screening result card (Chromatic or Playwright's
  built-in screenshot diff).
