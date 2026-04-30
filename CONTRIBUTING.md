# Contributing

## Getting Started

```bash
git clone <this-repo>
cd workfully-interview
pnpm install
pnpm db:up
pnpm db:migrate
cp .env.example .env # then add OPENROUTER_API_KEY
pnpm dev
```

For an AI-free local run (deterministic verdicts, no OpenRouter credits burned):

```bash
WORKFULLY_FAKE_AI=1 pnpm dev
```

## Commit Conventions

This repo uses [Conventional Commits](https://www.conventionalcommits.org/) enforced by commitlint.

Format: `type(scope): subject`

**Types:** feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert

**Scopes:** fsm, ai, db, ui, domain, e2e, ci, deps, docs, config, orchestrator, proxy, actions, log

Examples:

```
feat(fsm): add presentingResult substate with re-screen transition
fix(ai): handle schema-violation error from generateObject retry
docs(adr): add ADR 0006 explaining streaming verdicts
chore(deps): bump xstate to 5.32.0
```

## Branch Naming

```
feature/short-description
fix/short-description
chore/short-description
```

## Before Submitting a PR

1. `pnpm format:check` passes
2. `pnpm lint` passes
3. `pnpm typecheck` passes
4. `pnpm test` passes
5. `pnpm build` passes

`pnpm check` runs the first four together. All five run in CI.

These are also enforced by Husky pre-commit (lint-staged) and commit-msg (commitlint) hooks.

## Code Style

- Prettier handles formatting (runs on commit via lint-staged)
- ESLint handles code quality (next/core-web-vitals + typescript)
- Server components by default, `"use client"` only when needed
- TypeScript strict + `noUncheckedIndexedAccess` — index access returns `T | undefined`
- New FSM transitions need a Vitest case in `src/lib/fsm/machine.test.ts`
- AI changes need either a schema test or a contract test against `MockLanguageModelV3`
