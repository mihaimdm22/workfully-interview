# TODOS

Per skill / component, P0-P4. Completed items move to the bottom.

## E2E

### Pre-existing flake: screening upload race condition

**Priority:** P0
**Noticed on:** branch `mihaimdm22/architecture-page` (2026-04-30)
**Source:** Surfaced after merging origin/main (PR #12) into the walkthrough branch.

**What:** Two `e2e/screening.spec.ts` tests time out locally:

- "dashboard lists the screening after verdict" (line 140)
- "public share link renders without sidebar or chat log" (line 162)

Both tests upload a JD and a CV in rapid succession via two consecutive
`getByLabel("Upload PDF").setInputFiles(...)` calls. The page state stalls in
`SCREENING awaiting CV` — the JD upload registers but the second `setInputFiles`
appears to race with the FSM's optimistic concurrency control (added in PR #12).

**Why:** PR #12 (`feat(ai): AI settings modal + dynamic FSM timeout`) passed CI
green so the failure does not gate origin/main, but it reproduces deterministically
on slower local machines. The walkthrough page (`mihaimdm22/architecture-page`) does
not touch the screening flow — these tests are unrelated to the diff.

**Repro:**

```bash
PORT=3001 WORKFULLY_FAKE_AI=1 pnpm test:e2e screening.spec.ts -g "dashboard lists"
```

**Fix direction (not yet investigated):**

- Add a small `await page.waitForTimeout(...)` between the two uploads, OR
- Wait for the state pill to transition to `awaiting CV` before the second upload, OR
- Fix the underlying race in the orchestrator's optimistic-CAS retry loop so back-to-back uploads are serialized correctly.

**Related files:** `src/lib/fsm/orchestrator.ts`, `src/lib/fsm/machine.ts`, `e2e/screening.spec.ts:140-180`.

## Completed

(nothing yet)
