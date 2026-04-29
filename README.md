# Workfully Screening Bot

<p>
  <a href="https://github.com/mihaimdm22/workfully-interview/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/mihaimdm22/workfully-interview/ci.yml?branch=main&style=flat-square&label=CI&labelColor=0a0a0a" alt="CI"></a>
  <a href="https://github.com/mihaimdm22/workfully-interview/actions/workflows/codeql.yml"><img src="https://img.shields.io/github/actions/workflow/status/mihaimdm22/workfully-interview/codeql.yml?branch=main&style=flat-square&label=CodeQL&labelColor=0a0a0a" alt="CodeQL"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/mihaimdm22/workfully-interview?style=flat-square&labelColor=0a0a0a" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/node-%3E%3D24-339933?style=flat-square&labelColor=0a0a0a" alt="Node 24+">
  <img src="https://img.shields.io/badge/pnpm-10-F69220?style=flat-square&labelColor=0a0a0a" alt="pnpm 10">
</p>

A conversational, FSM-driven candidate screening bot built for the Workfully technical
challenge. The user can chat with the bot to:

1. **Idle** — get a greeting and a list of commands.
2. **Screening** — paste / upload a Job Description and a CV, get a structured fit verdict.
3. **Job Builder** — mocked, returns to idle.

The original challenge brief lives in [`docs/CHALLENGE.md`](./docs/CHALLENGE.md).

---

## TL;DR

```bash
pnpm install
pnpm db:up               # boots Postgres in Docker
pnpm db:migrate          # applies the schema
cp .env.example .env     # set ANTHROPIC_API_KEY
pnpm dev                 # http://localhost:3000
```

For E2E or contributor demos without burning Anthropic credits:

```bash
WORKFULLY_FAKE_AI=1 pnpm dev
```

---

## What's interesting

- **FSM as the source of truth.** The state machine (`src/lib/fsm/machine.ts`) is the
  only place that decides what's allowed. Server actions translate user input into
  events; nothing else mutates state. This makes the chat resumable, the transitions
  exhaustively testable, and `/cancel` work the same way from any sub-state.
- **Pure FSM, request-scoped actor.** The screening AI call is modelled as an XState
  actor that's _provided per request_, so the machine itself stays pure (no AI
  imports). Tests use a fake actor that returns a fixture; production wires up the
  real Anthropic call. Same machine, two contexts.
- **Structured output, not string parsing.** The screening verdict is generated via
  `generateObject` against a Zod schema (`src/lib/domain/screening.ts`). If the model
  can't produce schema-valid JSON, the SDK retries automatically and the actor either
  succeeds with a typed object or throws to the FSM's error path. We never parse
  free-text.
- **Persisted snapshots = resumable conversations.** Every transition writes the
  XState `PersistedSnapshot` to Postgres. A page reload rehydrates the actor at
  exactly the state it left off in.
- **One FSM-shaped E2E test, the AI is faked.** `WORKFULLY_FAKE_AI=1` swaps the real
  `screen()` call for a deterministic stub. CI runs Playwright against this. Real
  model behavior is covered by the schema-validated unit tests on the screening
  service boundary.

---

## Stack

| Layer      | Choice                                                                    | ADR                                                 |
| ---------- | ------------------------------------------------------------------------- | --------------------------------------------------- |
| Runtime    | Next.js 16 (App Router) + React 19                                        | [0002](./docs/adr/0002-architecture.md)             |
| FSM        | XState v5                                                                 | [0001](./docs/adr/0001-fsm-with-xstate.md)          |
| Database   | Postgres 17 + Drizzle ORM                                                 | [0003](./docs/adr/0003-database.md)                 |
| AI         | Vercel AI SDK v6 + Anthropic Claude Sonnet 4.6                            | [0004](./docs/adr/0004-ai-and-structured-output.md) |
| Validation | Zod v4 (single source of truth: schema → types → JSON schema for the LLM) | —                                                   |
| Testing    | Vitest (unit + coverage) + Playwright (E2E with fake AI)                  | [0005](./docs/adr/0005-testing-strategy.md)         |
| Style      | Tailwind CSS 4                                                            | —                                                   |
| Lang       | TypeScript 6 strict + `noUncheckedIndexedAccess`                          | —                                                   |

All versions are the latest stable as of April 2026.

---

## State machine

```
                 ┌──────────────────────────────┐
                 │           IDLE               │ ◀──── /cancel, /reset
                 │   "I'm here to help."        │
                 └──┬───────────────────┬───────┘
   /screen ─────────┘                   └────────── /newjob
                    ▼                              ▼
        ┌───────────────────────┐       ┌────────────────────┐
        │      SCREENING        │       │    JOB_BUILDER      │
        │ ┌───────────────────┐ │       │   (mocked, /cancel │
        │ │ awaitingJD        │ │       │    returns to idle)│
        │ └─────────┬─────────┘ │       └────────────────────┘
        │           ▼            │
        │ ┌───────────────────┐ │
        │ │ awaitingCv        │ │
        │ └─────────┬─────────┘ │
        │           ▼            │
        │ ┌───────────────────┐ │       ──invokes screen() actor──▶ Anthropic
        │ │ evaluating        │ │       ◀──────  result OR error  ──
        │ └─────┬───────┬─────┘ │
        │       ▼       ▼       │
        │ presenting   error    │
        │   Result    → idle    │
        └───────────────────────┘
```

The full hierarchy and transition table lives in
[`src/lib/fsm/machine.ts`](./src/lib/fsm/machine.ts) and the E2E behavior in
[`src/lib/fsm/machine.test.ts`](./src/lib/fsm/machine.test.ts).

---

## Project structure

```
src/
├── app/                    # Next.js App Router
│   ├── actions.ts          # Server Actions — the only mutation surface
│   ├── layout.tsx
│   ├── page.tsx            # Server Component, renders chat from DB
│   └── globals.css
├── components/             # UI components (one client island in composer.tsx)
│   ├── composer.tsx        # client: input + file picker + form submit
│   ├── message-bubble.tsx
│   ├── screening-result-card.tsx
│   ├── state-pill.tsx
│   └── quick-actions.tsx
└── lib/
    ├── domain/             # Pure types & rules — no I/O
    │   ├── intent.ts       # text → FSM event classifier
    │   ├── intent.test.ts
    │   └── screening.ts    # Zod schema for the verdict
    ├── fsm/                # XState machine + orchestrator
    │   ├── machine.ts      # the state machine itself (pure)
    │   ├── machine.test.ts
    │   ├── orchestrator.ts # bridges FSM ↔ DB ↔ AI (server-only)
    │   ├── replies.ts      # state → bot prompt
    │   ├── replies.test.ts
    │   └── snapshot.ts     # zod-validated PersistedSnapshot
    ├── db/                 # Drizzle layer
    │   ├── schema.ts
    │   ├── client.ts       # lazy singleton, dev-HMR safe
    │   ├── repositories.ts # the only place app code touches SQL
    │   ├── migrate.ts
    │   └── migrations/     # generated by drizzle-kit
    ├── ai/                 # AI boundary
    │   ├── screen.ts       # generateObject + Zod
    │   ├── screen.test.ts  # uses MockLanguageModelV3
    │   └── extract-pdf.ts  # PDF → text via unpdf
    └── cookies.ts          # conversation cookie helpers
e2e/
└── screening.spec.ts       # Playwright happy-path
fixtures/                   # Sample JD + 3 CVs (strong / weak / wrong-role)
docs/
├── CHALLENGE.md            # The original brief
└── adr/                    # Architecture Decision Records
```

The `lib/` layout follows a strict dependency order:

```
domain   ◀──  fsm   ◀──  ai
   ▲           ▲          ▲
   └───────────┼──────────┘
              app, components
```

`domain` has no dependencies on anything else. `fsm` depends on `domain`. The
`orchestrator` is the only file that reaches across layers (FSM + DB + AI), and it's
server-only by design.

---

## Testing strategy

The README's grading criteria explicitly name testing strategy, so here it is in
plain terms:

| Layer        | Tool                               | What it proves                                                                       |
| ------------ | ---------------------------------- | ------------------------------------------------------------------------------------ |
| Pure domain  | Vitest                             | Intent classifier, replies, schema validation                                        |
| FSM          | Vitest + XState                    | Every transition, /cancel from each substate, the error branch, snapshot rehydration |
| AI service   | Vitest + `MockLanguageModelV3`     | Schema validation, error propagation, latency tracking                               |
| Repositories | (Postgres integration)             | Not implemented — would use Testcontainers in CI; the pattern is here                |
| End-to-end   | Playwright + `WORKFULLY_FAKE_AI=1` | UI wiring, FSM transitions visible to the user                                       |

59 unit tests, all green; coverage thresholds enforced (≥80% statements/functions/lines, ≥75% branches; current ~95%).

```bash
pnpm test          # Vitest, ~200 ms
pnpm test:coverage # ditto + v8 coverage with thresholds
pnpm test:e2e      # Playwright (needs DB + WORKFULLY_FAKE_AI=1)
pnpm check         # format:check + lint + typecheck + knip + test
```

See [`docs/adr/0005-testing-strategy.md`](./docs/adr/0005-testing-strategy.md) for
the full rationale on why tests are split that way.

---

## Repo tooling

Everything below runs in CI on every push and PR.

| Concern             | Tool                                                                |
| ------------------- | ------------------------------------------------------------------- |
| Formatter           | Prettier 3 + `prettier-plugin-tailwindcss` (sorts Tailwind classes) |
| Linter              | ESLint 9 (`eslint-config-next` core-web-vitals + typescript)        |
| Type checker        | TypeScript 6 strict + `noUncheckedIndexedAccess`                    |
| Dead-code scanner   | Knip (unused files / exports / deps)                                |
| Pre-commit hook     | Husky 9 → `lint-staged` (Prettier + ESLint --fix --max-warnings 0)  |
| Commit-msg hook     | Husky 9 → `commitlint` (Conventional Commits, custom scope-enum)    |
| Security scanning   | GitHub CodeQL (security-and-quality queries) + `pnpm audit --prod`  |
| Workflow linter     | `actionlint` (Docker, lints `.github/workflows/**`)                 |
| Stale PRs / issues  | `actions/stale@v10` (30/7 day window)                               |
| Dependency upgrades | Dependabot (npm + github-actions, weekly, minor/patch grouped)      |
| Coverage            | Vitest + `@vitest/coverage-v8`, hard floors enforced                |
| Editor consistency  | `.editorconfig`, `.nvmrc` (Node 24)                                 |

Conventional Commits are enforced both locally (commit-msg hook) and in CI:

```
feat(fsm): add presentingResult substate
fix(ai): handle schema-violation error from generateObject
docs(adr): add ADR 0006 explaining streaming verdicts
chore(deps): bump xstate to 5.32.0
```

Allowed scopes: `fsm`, `ai`, `db`, `ui`, `domain`, `e2e`, `ci`, `deps`, `docs`, `config`.

---

## Try it locally

1. `pnpm install`
2. `pnpm db:up && pnpm db:migrate`
3. Copy `.env.example` to `.env` and add your `ANTHROPIC_API_KEY`.
4. `pnpm dev`
5. Open http://localhost:3000.
6. Type `/screen`, paste a JD (try copying from `fixtures/job-description.pdf`),
   then paste a CV (try `cv-strong-match.pdf` for a high-confidence verdict, or
   `cv-wrong-role.pdf` for a wrong-role rejection).

Other commands the bot understands: `/newjob`, `/cancel`, `/reset`,
or natural-language equivalents (`screen a candidate`, `start over`, `stop`).

---

## What I'd do with another day

- **Streaming verdicts.** `streamObject` would let the user see the verdict take shape
  in real time instead of staring at a spinner for ~10s.
- **PDF storage.** Right now we extract text and discard the original bytes. If
  recruiters need to re-download what the candidate uploaded, push the bytes to S3
  and record a key.
- **Screening replays.** The `screenings` table already stores JD + CV verbatim, so
  re-running an old verdict against a different model is just a worker job away.
- **Multi-tenancy.** Every row would gain a `workspace_id`; cookies would carry it.
  Routes would scope queries on it. Pure mechanical work, omitted for time.
- **Repository integration tests.** Run them against a Testcontainers Postgres in
  CI. The repos are tiny enough that the unit-tested FSM + AI service catches most
  regressions, but I'd add this for any change to schema.
- **Job Builder for real.** Today it returns a mock prompt — implementing it with
  the same FSM-as-source-of-truth approach would mirror the screening flow.
- **Observability.** A request-scoped logger that emits FSM transitions, AI latency,
  and DB query timing would make production debugging trivial.

---

## License

MIT (this is an interview challenge response — feel free to reuse anything useful).
