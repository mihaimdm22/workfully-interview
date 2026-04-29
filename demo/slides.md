---
marp: true
theme: default
paginate: true
size: 16:9
header: "Workfully Technical Challenge — David Marin"
footer: "FSM-driven Screening Bot · April 2026"
style: |
  section { font-size: 26px; line-height: 1.4; }
  section.title { font-size: 30px; }
  h1 { color: #0a0a0a; }
  h2 { color: #1f2937; }
  code { background: #f5f5f5; padding: 2px 6px; border-radius: 4px; }
  pre { background: #0a0a0a; color: #e5e7eb; border-radius: 6px; }
  table { font-size: 22px; }
  .small { font-size: 20px; color: #4b5563; }
  .columns { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }
---

<!-- _class: title -->

# Workfully Screening Bot

### A finite-state-machine conversational bot, built with discipline.

**David Marin** — Technical Challenge, April 2026
Repo: `mihaimdm22/workfully-interview`

---

# What I built

A conversational bot that:

1. **Greets** users and offers help (IDLE)
2. **Screens** a candidate against a JD (SCREENING)
3. **Mocks** a job builder flow (JOB_BUILDER)

…with one key constraint: **the FSM is the source of truth.**
Nothing else mutates conversation state. Ever.

> Brief: `docs/CHALLENGE.md` · Code: `src/lib/fsm/machine.ts`

---

# The stack at a glance

| Layer      | Choice                                           | Why                                                 |
| ---------- | ------------------------------------------------ | --------------------------------------------------- |
| Runtime    | Next.js 16 App Router + React 19                 | Matches Workfully's stack; Server Actions = clean   |
| FSM        | **XState v5**                                    | Hierarchical states + persisted snapshots, free     |
| Database   | **Postgres 17 + Drizzle ORM**                    | Mirrors Acme's RDS; JSONB for snapshots             |
| AI         | **Vercel AI SDK v6 + Claude via OpenRouter**     | Provider-swap by env var; structured output via Zod |
| Validation | **Zod v4**                                       | One schema → types, LLM constraint, DB column type  |
| Testing    | Vitest + Playwright (`WORKFULLY_FAKE_AI=1`)      | Deterministic CI, no API spend                      |
| Language   | TypeScript 6 strict + `noUncheckedIndexedAccess` | Strictest mode possible                             |

All versions current as of April 2026. Five ADRs document every decision.

---

# Architecture — strict layered, server-first

```
domain   ◀──  fsm   ◀──  ai
   ▲           ▲          ▲
   └───────────┼──────────┘
              app, components
```

- **`domain/`** — pure types, intent classifier, Zod schemas. No I/O.
- **`fsm/`** — XState machine (pure) + orchestrator (server-only).
- **`db/`** — Drizzle schema, lazy singleton client, repositories.
- **`ai/`** — `screen()` boundary, PDF extraction.
- **`app/`** — Server Actions are the **only** mutation surface.

`'server-only'` enforced at the right boundaries → client bundle stays clean.

---

# The state machine

```
                 ┌──────────────────────────────┐
                 │           IDLE               │ ◀── /cancel, /reset
                 └──┬───────────────────┬───────┘
   /screen ─────────┘                   └────────── /newjob
                    ▼                              ▼
        ┌───────────────────────┐       ┌────────────────────┐
        │      SCREENING        │       │    JOB_BUILDER     │
        │   awaitingJD          │       │  (mocked)          │
        │   awaitingCv          │       └────────────────────┘
        │   evaluating  ──invoke──▶ screen() actor ──▶ Claude
        │   presentingResult    │
        └───────────────────────┘
```

`/cancel` is **one line on the parent state**, not wired to every leaf.
That's the value of statecharts over hand-rolled reducers.

---

# Why XState (not a discriminated union + reducer)

I did consider hand-rolling. Three things made XState the right call:

1. **Hierarchical states.** `/cancel` works from any screening sub-state for free.
2. **`PersistedSnapshot` is a published API.** Page reload → DB → rehydrate to the exact same state. Zero custom serializer.
3. **Actors for async work.** The AI call lives **inside** the FSM as an `invoke`d actor. `onDone` → `presentingResult`, `onError` → `idle`. Fully declarative.

> Bonus: `botMachine.provide({ actors: { screen } })` lets tests swap a fake actor without touching the machine. Same machine, two contexts.

---

# AI: structured output, not string parsing

```ts
// src/lib/domain/screening.ts
export const screeningResultSchema = z.object({
  verdict: z.enum(["strong", "moderate", "weak", "wrong_role"]),
  score: z.number().int().min(0).max(100),
  mustHaves: z.array(requirementMatchSchema).min(1),
  niceToHaves: z.array(requirementMatchSchema),
  strengths: z.array(z.string()).max(5),
  gaps: z.array(z.string()).max(5),
  recommendation: z.string().min(1).max(300),
});
```

```ts
// src/lib/ai/screen.ts
const { object } = await generateObject({
  model: openrouter(modelId),
  schema: screeningResultSchema, // ← LLM must satisfy this
  schemaName: "ScreeningResult",
  system: SYSTEM_PROMPT,
  prompt: buildPrompt(input),
  maxRetries: 2,
});
```

The model returns a typed `ScreeningResult` **or it throws**. There is no "parse the JSON and pray" path.

---

# One Zod schema → three things

```
                 screeningResultSchema (Zod)
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
   TS types         LLM constraint    DB column type
  z.infer<>      generateObject({ schema })  Drizzle .$type<>()
```

Change the schema in **one file** → types, LLM contract, and DB shape all update together.

This is the discipline that keeps an LLM honest in production.

---

# Provider routing through OpenRouter

```ts
const DEFAULT_MODEL = "anthropic/claude-sonnet-4.6";
const modelId = process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL;
const model = openrouter(modelId);
```

- Same code talks to **any** vendor: Anthropic, OpenAI, Google, Mistral, …
- A/B different models with **one env var**, zero code edits.
- Single key to rotate. Single billing surface.
- The schema, the prompt, and the FSM don't move when the provider changes.

> This is exactly the abstraction Workfully would want when the model market keeps shifting.

---

# Database — Postgres + Drizzle (Acme's stack)

```text
conversations(id PK, fsm_snapshot JSONB, ...)
   ├─ messages(id PK, conversation_id FK CASCADE, role, content, ...)
   └─ screenings(id PK, conversation_id FK CASCADE, jd, cv, result JSONB, ...)
```

Three intentional choices:

1. **`fsm_snapshot` is JSONB.** Indexable, queryable. "Which conversations are stuck in `evaluating`?" is one SQL query.
2. **`screenings` is denormalized.** JD + CV copied in. The verdict stays reproducible against the inputs the model actually saw.
3. **Messages are append-only.** The transcript **is** the audit log.

Drizzle (not Prisma) because the SQL stays transparent — and the bundle is ~12 KB instead of ~6 MB.

---

# Persistence in action — resumable conversations

Every transition writes the XState `PersistedSnapshot` to Postgres.

```ts
const persisted = actor.getPersistedSnapshot();
await updateConversationSnapshot(conversationId, persisted);
```

```ts
// On the next request:
const actor = createActor(machine, {
  input: { conversationId },
  snapshot: convo.fsmSnapshot, // ← rehydrate at the exact same state
});
actor.start();
```

**Reload the page mid-screening — you're still in `awaitingCv`.**
**Restart the server — same.**
This is what the `/cancel from any sub-state` test guarantees end-to-end.

---

# Testing strategy — pyramid, not snowman

```
         Playwright × 1 — happy path, faked AI for determinism
         ────────────────────────────────────────────
         Vitest boundary tests (AI service, snapshot, repos)
         ────────────────────────────────────────────
         Vitest pure unit (FSM, intents, replies, schema) ← bulk
```

**59 tests · ~250 ms · 95%+ coverage · hard floors enforced.**

Five rules I wrote tests by:

1. Test **my** FSM, not XState's framework.
2. Test at the **boundary**, not the implementation.
3. Mock at the **integration point** (`provide({ actors })`), not deeper.
4. **One** E2E for "wires connected", not for coverage.
5. **Don't test the model's IQ.** That's an eval problem, not a unit-test problem.

---

# `WORKFULLY_FAKE_AI=1` — the test escape hatch

```ts
// src/lib/ai/screen.ts
if (process.env.WORKFULLY_FAKE_AI === "1" && !deps.model) {
  return fakeScreen(input);
}
```

A 30-line deterministic stub that returns:

- `strong` for the senior CV
- `weak` for the junior CV
- `wrong_role` for the designer CV

Why this matters:

- **CI doesn't depend on OpenRouter uptime** or burn budget.
- Playwright assertions can be **precise** — same CV, same verdict.
- The codepath is **dead in production** (env var is never set).

This is how you keep AI tests fast, deterministic, and free.

---

# Repo tooling — every PR is gated by all of this

| Concern            | Tool                                                      |
| ------------------ | --------------------------------------------------------- |
| Formatter          | Prettier 3 + `prettier-plugin-tailwindcss`                |
| Linter             | ESLint 9 (`eslint-config-next` core-web-vitals + TS)      |
| Type checker       | TypeScript 6 strict + `noUncheckedIndexedAccess`          |
| Dead code          | Knip (unused files / exports / deps)                      |
| Pre-commit         | Husky 9 → `lint-staged` (`prettier` + `eslint --fix`)     |
| Commit-msg         | Husky 9 → `commitlint` (Conventional Commits, scope-enum) |
| Security           | GitHub **CodeQL** + `pnpm audit --prod`                   |
| Workflow lint      | `actionlint` (Docker, lints `.github/workflows/**`)       |
| Stale PRs / issues | `actions/stale@v10`                                       |
| Dep upgrades       | Dependabot (npm + actions, weekly, grouped)               |
| Coverage           | Vitest + `@vitest/coverage-v8`, hard floors               |

> Five-job CI on every push: **lint+type, test, build, e2e (with Postgres), audit.**

---

# Conventional Commits, enforced both ways

```
feat(fsm): add presentingResult substate
fix(ai): handle schema-violation error from generateObject
docs(adr): add ADR 0006 explaining streaming verdicts
chore(deps): bump xstate to 5.32.0
```

- Locally: Husky `commit-msg` hook blocks bad commits.
- In CI: same `commitlint` config runs on PRs.

Allowed scopes: `fsm`, `ai`, `db`, `ui`, `domain`, `e2e`, `ci`, `deps`, `docs`, `config`.

This is what makes a `CHANGELOG.md` write itself — and what makes `git log` readable a year from now.

---

# AI in my workflow — Claude Code as a co-engineer

I built this with **Claude Code** as a paired engineer. Not "vibe coding":

- **ADR-driven.** Each major decision (FSM, architecture, DB, AI, testing) has a one-page ADR I wrote with the model, then iterated on. They're real decisions, not summaries.
- **Tests written first.** The model proposes; the FSM tests say yes/no. The state machine has 100% transition coverage because of this loop.
- **Schema as the contract.** I write the Zod schema, the model implements against it. `generateObject` then enforces the same contract at runtime.
- **Reviews, not autopilot.** Every diff went through a code-review agent before commit. CodeQL catches what humans miss; the model catches what CodeQL misses.

**The discipline matters more than the tool.** AI accelerated the work; the architecture and tests are what make it shippable.

---

# Demo plan — what I'll show you live

1. **The FSM** — open `src/lib/fsm/machine.ts`, point at the parent `CANCEL` and the `invoke` block.
2. **The schema** — open `src/lib/domain/screening.ts`. One file, three uses.
3. **The app** — `pnpm dev`, http://localhost:3000.
   - Type `/screen`, paste `fixtures/job-description.pdf`, then `cv-strong-match.pdf`.
   - Show the structured verdict card.
   - Reload the page **mid-flow** to prove rehydration.
   - Type `/cancel` from `awaitingCv` to prove the parent transition.
4. **The tests** — `pnpm test` runs in 250 ms. `pnpm check` runs the full local CI.
5. **The fake AI** — `WORKFULLY_FAKE_AI=1 pnpm dev` + walk through `screen.test.ts` using `MockLanguageModelV3`.

---

# What I'd ship next (if I had another day)

- **Streaming verdicts** with `streamObject` — verdict appears token-by-token instead of a 10s spinner.
- **PDF storage in S3** — keep the original bytes for recruiter re-download.
- **Screening replays** — `screenings` already stores JD + CV verbatim. Re-run an old verdict against a different model = one worker job.
- **Multi-tenancy** — every row gets a `workspace_id`, scoped from the cookie. Pure mechanical.
- **Repository integration tests** — Testcontainers Postgres in CI. The pattern's there; I prioritized FSM coverage instead.
- **Eval harness** — `pnpm eval` against a labeled fixture set. Run on every prompt change.
- **Job Builder for real** — same FSM-as-source-of-truth approach mirrored from screening.

---

<!-- _class: title -->

# Thank you

**Repo** · `github.com/mihaimdm22/workfully-interview`
**ADRs** · `docs/adr/0001…0005`
**Demo** · `pnpm install && pnpm db:up && pnpm db:migrate && pnpm dev`

Questions?
