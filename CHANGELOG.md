# Changelog

All notable changes to the Workfully Screening Bot will be documented in this file.

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
