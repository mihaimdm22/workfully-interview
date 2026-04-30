# TODOS

Per skill / component, P0-P4. Completed items move to the bottom.

## Completed

### E2E: screening upload race condition

**Completed:** v0.3.1.0 (2026-04-30)

Both `e2e/screening.spec.ts` tests that uploaded JD + CV back-to-back without
waiting for the FSM state to transition (`dashboard lists the screening after verdict`
at line 140 and `public share link renders without sidebar or chat log` at line 162)
now wait for `awaiting CV` between the two `setInputFiles` calls, matching the
existing pattern at line 104. This serialises the uploads against the orchestrator's
optimistic-CAS loop introduced in PR #12.

CI run #73717179798 had the second test failing through 3 retries; both now pass
locally + in CI.
