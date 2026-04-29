# Changelog

All notable changes to the Workfully Screening Bot will be documented in this file.

## [0.1.4.0] - 2026-04-29

### Added

- **Concurrency-safe orchestrator (W19').** Adds a `version` column to `conversations` and an optimistic compare-and-swap update primitive (`updateConversationSnapshotIfVersion`). Two concurrent `dispatch()` calls on the same conversation can no longer silently fork the FSM — the second writer gets a typed `ConcurrentModificationError` which the action layer surfaces to the user as "This conversation changed in another tab — refresh to continue." See ADR 0006 for the full rationale (including why we rejected `SELECT FOR UPDATE`).
- **FSM-owned screening timeout** via XState `after` delayed transition inside `evaluating`. When the 60s timeout fires, XState transitions to idle and stops the invoked actor — which aborts its signal, which cancels the in-flight `generateObject` HTTP call. No more orchestrator-level fork window between "FSM resolved" and "orchestrator decided too late."
- **AbortSignal plumbing through XState.** `screen()` now accepts a `signal` option and forwards it to `generateObject({ abortSignal })`. The orchestrator's `fromPromise` actor passes XState's own signal in, so cancellation is structural — not "we hope the network call finishes soon."
- **Request-scoped structured logger** (`src/lib/log.ts`) emitting one JSON line per FSM transition with `{ conv, from, to, event, ms, model }`. Silent under `VITEST` so the unit suite isn't drowned in JSON.
- **Testcontainers integration test** for the CAS primitive (`test/integration/orchestrator.concurrent.test.ts`). Boots a real Postgres, runs migrations, and verifies that two concurrent CAS attempts on the same expected version produce exactly one winner. Lives in a separate `pnpm test:integration` lane so the default `pnpm test` stays Docker-free for laptops.
- **Snapshot schema tightening.** `isPersistedSnapshot` now narrows `value` to the actual FSM state set instead of `z.unknown()`. A row with a fictional state name is rejected at the DB boundary instead of crashing XState mid-rehydration.
- **Server Actions unit tests** (`src/app/actions.test.ts`) covering text/PDF validation, intent → event mapping, filename-based JD/CV inference, and the `ConcurrentModificationError → "refresh"` mapping.
- **Proxy unit tests** (`src/proxy.test.ts`) covering cookie minting, attribute correctness, and the new `secure` flag in production.
- **Orchestrator integration test suite** (`src/lib/fsm/orchestrator.test.ts`) covering startConversation, success path, AI failure, actor.stop on error paths, and CAS conflict propagation.

### Changed

- **Cookie security in production.** Conversation cookie now sets `secure: true` when `NODE_ENV === "production"`. Local dev on `http://localhost` is unaffected.
- **DB connection pool size is environment-aware.** Defaults to `1` on Vercel Fluid Compute (single-process per instance, larger pools just queue), `10` elsewhere. Override via `MAX_DB_CONNECTIONS`.
- **Fake-AI test escape hatch uses explicit markers.** `[TEST_VERDICT_WEAK]` / `[TEST_VERDICT_WRONG_ROLE]` in the CV string force a specific verdict from the fake. Replaces the previous keyword heuristic that coupled the fake to fixture content. Default (no marker) returns `strong`.
- **CI: `e2e` job depends on `test`.** A broken unit test now fast-fails before the slower Playwright job runs.
- **CI: coverage uploads to Codecov** (requires `CODECOV_TOKEN` repo secret; action is a no-op when missing, so PRs from forks still pass).
- **CI: new `integration` job** runs `pnpm test:integration` against a fresh Postgres container.
- **Commitlint scopes extended** with `orchestrator`, `proxy`, `actions`, `log` so granular scopes work without hitting the husky hook.
- **`actor.stop()` is now in `try/finally`** in `dispatch` and `loadConversation`. A thrown `waitFor` (timeout) or downstream DB write failure can no longer leak the actor's timers and subscriptions.
- **`renderReply` simplification.** The unreachable middle branch was deleted; the function now short-circuits on errors and falls through to `promptForState` otherwise.

### Fixed

- **Stable React keys in `ScreeningResultCard`.** Replaced `key={i}` array-index keys with composite keys derived from data (`requirement|matched`, `title|bullet`). Prevents reconciliation churn when lists reorder or animate in.
- **Stale doc comment in `cookies.ts`** referenced `src/middleware.ts`; the file was renamed to `src/proxy.ts` per Next 16. Updated.

## [0.1.3.0] - 2026-04-29

### Fixed

- **Verdict cards now persist across screening transitions.** Previously the verdict card vanished from chat history the moment a user typed `/screen` again, leaving a stranded "Here's the screening verdict..." announcement with no card. The card is now driven from the persisted `screenings` table (paired by `createdAt` to the bot announcement message that hosted it), so historical verdicts stay visible across `/screen`, `/newjob`, `/reset`, and full page reload. Two consecutive screenings produce two cards in the transcript.
- **`/reset` now works from every screening sub-state.** It was silently no-op'd from `awaitingJobDescription` and `awaitingCv` because the screening parent state declared `CANCEL` but not `RESET`. The README and the verdict-ready prompt both advertise `/reset` as a global "head back to idle" command, and `jobBuilder` already accepted both. Mirrored the existing `CANCEL` handler at the screening parent so `RESET` behaves the same way: target idle, run `clearScreening`.

### Added

- **`pairScreeningsToMessages` pure helper** (`src/lib/fsm/pair-screenings.ts`) that walks the message and screening lists once in O(N+M) and returns a per-message map of paired verdicts. Five unit tests cover empty input, single-screening pairing, multi-screening preservation, role filtering, and the leading bot greeting that must stay bare.
- **`listScreenings(conversationId)` repository function** (`src/lib/db/repositories.ts`) returning every persisted verdict for a conversation, ordered by `createdAt`.
- **Two FSM regression tests** for `/reset` from `awaitingJobDescription` and `awaitingCv`.

## [0.1.2.0] - 2026-04-29

### Fixed

- **Strict-mode structured output compatibility.** Removed `min`/`max`/`minLength`/`maxLength`/`minItems` keywords from `screeningResultSchema` (`src/lib/domain/screening.ts`). OpenAI/Azure structured outputs reject these JSON Schema keywords in strict mode, which broke OpenRouter's promise of provider portability (ADR 0004). The same calibration is now expressed in `.describe()` text and the system prompt; shape and types are still enforced.

### Added

- **Interview presentation kit (`demo/`).** Marp-based 19-slide deck (`slides.md`), word-for-word walkthrough script (`walkthrough.md`), live-demo runbook (`demo.md`), and a rendered `slides.pptx` (4.5 MB) ready to drop into PowerPoint, Keynote, or Google Slides. Covers the FSM choice, structured-output AI, OpenRouter abstraction, testing pyramid, repo tooling, and how Claude Code was used in the build.

## [0.1.1.0] - 2026-04-29

### Changed

- **Provider routing moved to OpenRouter.** The screening service now talks to `@openrouter/ai-sdk-provider` instead of `@ai-sdk/anthropic`. Same Claude Sonnet 4.6 default (`anthropic/claude-sonnet-4.6`), but `OPENROUTER_MODEL` can switch to any vendor (OpenAI, Google, …) without code edits. Env vars renamed: `ANTHROPIC_API_KEY` → `OPENROUTER_API_KEY`, `ANTHROPIC_MODEL` → `OPENROUTER_MODEL`.
- **Production database moves to Neon.** `DATABASE_URL` now expects a hosted Postgres (Neon's pooled connection string with `?sslmode=require`); local Docker remains the dev default.

### Added

- **Vercel-friendly database URL fallback chain.** `src/lib/db/connection-string.ts` resolves `DATABASE_URL` → `STORAGE_DATABASE_URL` → `POSTGRES_URL`, so the Vercel marketplace integration's auto-set env vars work without renaming anything in the dashboard.

## [0.1.0.0] - 2026-04-28

### Added

- **FSM-driven candidate screening bot** built on Next.js 16 App Router + React 19 + XState v5. Three states (IDLE, SCREENING, JOB_BUILDER) with persisted snapshots so conversations survive page reloads and server restarts.
- **Structured AI screening** via Vercel AI SDK + Claude Sonnet 4.6 (routed through OpenRouter) with `generateObject` against a Zod schema. The verdict is always schema-valid or the FSM moves to its error branch — no free-text parsing.
- **Postgres persistence** with Drizzle ORM. Three tables: `conversations` (FSM snapshot as JSONB), append-only `messages`, denormalized `screenings`. Migrations checked into `src/lib/db/migrations/`.
- **Chat UI** with Server Actions for every transition, file upload (PDF parsing via `unpdf`), state pill, screening result card, and dark/light support.
- **Test suite**: 59 unit tests across 7 files (FSM transitions, intent classifier, replies, AI service via `MockLanguageModelV3`, snapshot validation, fake-AI branch, PDF extraction). Coverage 95%+ with hard floors enforced.
- **Playwright E2E** with `WORKFULLY_FAKE_AI=1` so CI runs deterministically without burning OpenRouter credit.
- **Repo tooling parity with reference setup**: ESLint 9, Prettier 3 with Tailwind class sorting, TypeScript 6 strict + `noUncheckedIndexedAccess`, Husky 9 pre-commit (`lint-staged`) + commit-msg (`commitlint`), Knip dead-code scanner, `.editorconfig`, `.nvmrc` (Node 24).
- **GitHub Actions CI**: 5-job pipeline (lint+typecheck, test+coverage, build, Playwright E2E with Postgres service container, audit). Plus CodeQL security scanning, actionlint workflow lint, stale issue/PR sweep, Dependabot weekly updates.
- **Repo hygiene**: LICENSE (MIT), CONTRIBUTING, SECURITY, CODEOWNERS, PR template, three issue templates.
- **Architecture docs**: README + 5 ADRs covering FSM choice, architecture, database, AI/structured output, and testing strategy.
