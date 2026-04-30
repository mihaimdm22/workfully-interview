# Workfully Screening Bot

<p>
  <a href="https://github.com/mihaimdm22/workfully-interview/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/mihaimdm22/workfully-interview/ci.yml?branch=main&style=flat-square&label=CI&labelColor=0a0a0a" alt="CI"></a>
  <a href="https://github.com/mihaimdm22/workfully-interview/actions/workflows/codeql.yml"><img src="https://img.shields.io/github/actions/workflow/status/mihaimdm22/workfully-interview/codeql.yml?branch=main&style=flat-square&label=CodeQL&labelColor=0a0a0a" alt="CodeQL"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/mihaimdm22/workfully-interview?style=flat-square&labelColor=0a0a0a" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/node-%3E%3D24-339933?style=flat-square&labelColor=0a0a0a" alt="Node 24+">
  <img src="https://img.shields.io/badge/pnpm-10-F69220?style=flat-square&labelColor=0a0a0a" alt="pnpm 10">
</p>

A conversational, FSM-driven candidate screening bot built for the Workfully technical
challenge. Chat with the bot, get a structured fit verdict, share it as a public link or
PDF. The whole thing lives behind a workspace shell — sidebar with recent screenings,
dashboard at `/`, permanent URLs per verdict, ⌘K search.

1. **Idle** — get a greeting and a list of commands.
2. **Screening** — paste / upload a Job Description and a CV, watch the verdict stream in.
3. **Job Builder** — mocked, returns to idle.

Verdicts get a permanent page at `/screening/[id]`, an unguessable public share at
`/s/[slug]`, an Open Graph card image, and a server-rendered Chromium PDF.

The original challenge brief lives in [`docs/CHALLENGE.md`](./docs/CHALLENGE.md). The
visual contract lives in [`DESIGN.md`](./DESIGN.md).

---

## TL;DR

```bash
pnpm install
pnpm db:up               # boots Postgres in Docker
pnpm db:migrate          # applies the schema
cp .env.example .env     # set OPENROUTER_API_KEY
pnpm dev                 # http://localhost:3000
```

**Fast path** — try it in under a minute, no API key, only Docker:

```bash
pnpm install && pnpm db:up && pnpm db:migrate
cp .env.example .env     # OPENROUTER_API_KEY can stay as-is for fake-AI mode
WORKFULLY_FAKE_AI=1 pnpm dev
```

The fake AI returns deterministic verdicts driven by markers in the CV
(`[TEST_VERDICT_WEAK]`, `[TEST_VERDICT_WRONG_ROLE]`, default = strong). Same
codepath that CI runs for E2E.

---

## What's interesting

- **FSM as the source of truth.** The state machine (`src/lib/fsm/machine.ts`) is the
  only place that decides what's allowed. Server actions translate user input into
  events; nothing else mutates state. This makes the chat resumable, the transitions
  exhaustively testable, and `/cancel` work the same way from any sub-state.
- **Pure FSM, request-scoped actor.** The screening AI call is modelled as an XState
  actor that's _provided per request_, so the machine itself stays pure (no AI
  imports). Tests use a fake actor that returns a fixture; production wires up the
  real LLM call (Claude via OpenRouter). Same machine, two contexts.
- **Structured output, not string parsing.** The screening verdict is generated via
  `generateObject` (or `streamObject` for streaming) against a Zod schema
  (`src/lib/domain/screening.ts`). If the model can't produce schema-valid JSON, the
  SDK retries automatically and the actor either succeeds with a typed object or
  throws to the FSM's error path. We never parse free-text.
- **Streaming verdicts via SSE.** `screenStreaming()` wraps `streamObject` and emits
  partial verdicts through an `onPartial` callback. The orchestrator's
  `dispatchStreaming()` threads it through, the route handler at
  `/api/screening/stream` returns `text/event-stream`, and `<ChatStream>` consumes it
  client-side. Fake-AI mode emits 11 timed partials over ~2.5s so demos show the same
  shape without burning OpenRouter credits.
- **Persisted snapshots = resumable conversations.** Every transition writes the
  XState `PersistedSnapshot` to Postgres. A page reload rehydrates the actor at
  exactly the state it left off in.
- **Public share by design, private by default.** A verdict gets a permanent
  `/screening/[id]` page (private) and an opt-in `/s/[slug]` page (public). The
  privacy boundary is enforced by TypeScript: the public path uses
  `getScreeningForShare` which returns a narrower type that omits JD, CV, and the
  conversation log — no accidental leak through a careless render.
- **One FSM-shaped E2E test, the AI is faked.** `WORKFULLY_FAKE_AI=1` swaps the real
  `screen()` call for a deterministic stub. CI runs Playwright against this. Real
  model behavior is covered by the schema-validated unit tests on the screening
  service boundary.
- **Runtime AI knobs without redeploying.** A topbar gear opens a settings modal —
  pick from a server-side allowlist of OpenRouter models, tune the FSM evaluation
  timeout, max retries, and temperature. The model dropdown live-fetches OpenRouter's
  `/api/v1/models` and intersects the response with a curated allowlist (so every
  option is one we trust for structured output and OpenRouter is currently serving),
  with a 1h in-process cache and a hardcoded fallback. Settings are persisted in a
  singleton `app_settings` Postgres row. Precedence at request time is
  `OPENROUTER_MODEL` env var → DB → hardcoded default — env still wins, preserving
  the ops-driven swap promise from ADR 0004. The FSM evaluation timeout is now a
  per-actor `delays.evalTimeout` reading from context, so settings changes apply on
  the next dispatch.

---

## Stack

| Layer       | Choice                                                                    | ADR                                                 |
| ----------- | ------------------------------------------------------------------------- | --------------------------------------------------- |
| Runtime     | Next.js 16 (App Router) + React 19                                        | [0002](./docs/adr/0002-architecture.md)             |
| FSM         | XState v5                                                                 | [0001](./docs/adr/0001-fsm-with-xstate.md)          |
| Database    | Postgres 17 + Drizzle ORM                                                 | [0003](./docs/adr/0003-database.md)                 |
| Concurrency | Optimistic CAS (per-conversation `version` column)                        | [0006](./docs/adr/0006-orchestrator-concurrency.md) |
| AI          | Vercel AI SDK v6 + Claude Sonnet 4.6 via OpenRouter                       | [0004](./docs/adr/0004-ai-and-structured-output.md) |
| Streaming   | `streamObject` + SSE route handler (`/api/screening/stream`)              | [0004](./docs/adr/0004-ai-and-structured-output.md) |
| Validation  | Zod v4 (single source of truth: schema → types → JSON schema for the LLM) | —                                                   |
| Testing     | Vitest (unit) + Testcontainers (integration) + Playwright (E2E, fake AI)  | [0005](./docs/adr/0005-testing-strategy.md)         |
| Style       | Tailwind CSS 4 (`@theme inline` tokens, utility-class refactor)           | [DESIGN.md](./DESIGN.md)                            |
| PDF export  | `puppeteer-core` + `@sparticuz/chromium` (server-side render)             | —                                                   |
| OG image    | `next/og` at `/s/[slug]/opengraph-image`                                  | —                                                   |
| Lang        | TypeScript 6 strict + `noUncheckedIndexedAccess`                          | —                                                   |

All versions are the latest stable as of April 2026.

---

## State machine

```
                 ┌──────────────────────────────┐
                 │           idle               │ ◀──── /cancel, /reset
                 │   "I'm here to help."        │
                 └──┬───────────────────┬───────┘
   /screen ─────────┘                   └────────── /newjob
                    ▼                              ▼
       ┌─────────────────────────┐    ┌────────────────────┐
       │       screening         │    │    jobBuilder       │
       │ ┌──────────────────────┐│    │   (mocked, /cancel │
       │ │ gathering            ││    │    returns to idle)│
       │ │  fills JD/CV slots,  ││    └────────────────────┘
       │ │  always → evaluating ││
       │ │  once both filled    ││
       │ └──────────┬───────────┘│
       │            ▼             │   ──invokes screen() actor──▶ OpenRouter
       │ ┌──────────────────────┐│   ◀──── result | error | abort ──
       │ │ evaluating           ││
       │ │  └ after 60s ───┐    ││
       │ └────┬───────┬────│────┘│
       │      ▼       ▼    ▼     │
       │ presenting  error timedOut → idle (with typed error)
       │   Result    → idle      │
       └─────────────────────────┘
```

The full hierarchy and transition table lives in
[`src/lib/fsm/machine.ts`](./src/lib/fsm/machine.ts) and the E2E behavior in
[`src/lib/fsm/machine.test.ts`](./src/lib/fsm/machine.test.ts).

---

## Project structure

```
src/
├── app/                            # Next.js App Router
│   ├── actions.ts                  # Server Actions — the only mutation surface
│   ├── layout.tsx                  # Root: theme bootstrap, font loading
│   ├── globals.css                 # Tailwind 4 @theme tokens, design vars
│   ├── (workspace)/                # Workspace shell route group (sidebar + topbar)
│   │   ├── layout.tsx              # Shell — Sidebar + Topbar + CmdKPalette
│   │   ├── page.tsx                # Dashboard (`/`) — screening cards + filter tabs
│   │   └── screening/
│   │       ├── new/page.tsx        # Active chat (`/screening/new`)
│   │       └── [id]/page.tsx       # Permanent verdict page (`/screening/[id]`)
│   ├── s/                          # Public share (no shell)
│   │   ├── layout.tsx              # Bare layout — no sidebar leak
│   │   └── [slug]/
│   │       ├── page.tsx            # Public verdict (`/s/[slug]`)
│   │       ├── opengraph-image.tsx # 1200×630 OG card via next/og
│   │       └── pdf/
│   │           ├── page.tsx        # Print HTML (used by Chromium)
│   │           └── download/route.ts  # Headless Chromium → A4 PDF
│   └── api/screening/stream/route.ts  # SSE — streaming verdicts
├── components/                     # UI
│   ├── shell/                      # Workspace chrome
│   │   ├── sidebar.tsx             # Brand + recents + workspace footer
│   │   └── topbar.tsx              # Breadcrumbs + ⌘K input + theme toggle
│   ├── ui/                         # Primitives (Pill, IconButton, ScoreDisplay)
│   ├── chat-stream.tsx             # client: SSE consumer, optimistic render
│   ├── streaming-verdict.tsx       # Progressive verdict reveal during stream
│   ├── verdict-header.tsx          # Detail-page header — score + meta
│   ├── requirement-list.tsx        # Must-haves + nice-to-haves
│   ├── bullet-block.tsx            # Strengths / gaps two-column
│   ├── recommendation.tsx          # Slack-paste block + copy button
│   ├── share-row.tsx               # "Generate share link"
│   ├── screening-card.tsx          # Dashboard card
│   ├── cmd-k-palette.tsx           # ⌘K search palette
│   ├── theme-toggle.tsx            # Light/dark with localStorage
│   ├── message-bubble.tsx
│   ├── screening-result-card.tsx   # In-chat verdict card
│   └── state-pill.tsx
└── lib/
    ├── domain/                     # Pure types & rules — no I/O
    │   ├── intent.ts               # text → FSM event classifier
    │   ├── screening.ts            # Zod schema for the verdict
    │   ├── verdict-style.ts        # Single source of truth for verdict colors
    │   └── fuzzy-match.ts          # 30-line scorer powering ⌘K
    ├── fsm/                        # XState machine + orchestrator
    │   ├── machine.ts              # The state machine itself (pure)
    │   ├── orchestrator.ts         # FSM ↔ DB ↔ AI bridge (server-only)
    │   ├── replies.ts              # state → bot prompt
    │   ├── pair-screenings.ts      # Pairs verdicts to messages in O(N+M)
    │   └── snapshot.ts             # zod-validated PersistedSnapshot
    ├── db/                         # Drizzle layer
    │   ├── schema.ts               # conversations, messages, screenings, share_links
    │   ├── client.ts               # Lazy singleton, dev-HMR safe
    │   ├── repositories.ts         # Public/private split: getScreeningById vs
    │   │                           #   getScreeningForShare (narrower type)
    │   ├── connection-string.ts    # DATABASE_URL fallback chain
    │   └── migrations/             # Generated by drizzle-kit
    ├── ai/                         # AI boundary
    │   ├── screen.ts               # generateObject + streamObject + Zod
    │   └── extract-pdf.ts          # PDF → text via unpdf
    ├── pdf/
    │   └── browser.ts              # puppeteer-core + @sparticuz/chromium launcher
    ├── log.ts                      # Request-scoped structured logger
    └── cookies.ts                  # Conversation cookie helpers
e2e/
└── screening.spec.ts               # Playwright — dashboard + new chat + share round-trip
fixtures/                           # Sample JD + 3 CVs (strong / weak / wrong-role)
docs/
├── CHALLENGE.md                    # The original brief
└── adr/                            # Architecture Decision Records (0001–0006)
DESIGN.md                           # Design system — tokens, components, a11y
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

All unit tests green; coverage thresholds enforced (≥80% statements/functions/lines, ≥75% branches; current ~95%). One drift test (`verdict-style.test.ts`) reads `globals.css` at runtime and asserts every CSS variable matches the constants in `verdict-style.ts` — the build fails if `DESIGN.md` and the runtime tokens diverge.

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

Allowed scopes: `fsm`, `ai`, `db`, `ui`, `domain`, `e2e`, `ci`, `deps`, `docs`, `config`, `orchestrator`, `proxy`, `actions`, `log`.

---

## Try it locally

1. `pnpm install`
2. `pnpm db:up && pnpm db:migrate`
3. Copy `.env.example` to `.env` and add your `OPENROUTER_API_KEY`.
4. `pnpm dev`
5. Open http://localhost:3000 — you land on the dashboard. Empty on first run.
6. Click **+ New screening** in the sidebar (or hit ⌘K and pick "New screening")
   to land on `/screening/new`. Type `/screen`, paste a JD (try
   `fixtures/job-description.pdf`), then a CV (`cv-strong-match.pdf` for a
   high-confidence verdict, or `cv-wrong-role.pdf` for a wrong-role rejection).
7. Watch the verdict stream in. When it lands, you redirect to a permanent
   `/screening/[id]` page. Click **Generate share link** to mint a public
   `/s/[slug]` URL — paste it into Slack to see the OG card unfurl, or click
   the PDF icon on the share page to download an A4 print.
8. Back on the dashboard, your screening appears as a card. Use the tab strip
   to filter by verdict tier.

Other commands the bot understands: `/newjob`, `/cancel`, `/reset`,
or natural-language equivalents (`screen a candidate`, `start over`, `stop`).
⌘K (or Ctrl-K) opens the search palette from anywhere.

---

## What shipped on day two

After the original v0.1.0 deliverable, an audit pass on the codebase produced
14 small wins plus one structural change. The headline:

**Concurrency-safe orchestrator with FSM-owned timeout and structural cancellation.**
Two reviewers (Codex CLI and an independent Claude subagent) audited
`src/lib/fsm/orchestrator.ts` and surfaced the same bug: under concurrent
requests on the same conversation, two writers could both read the same FSM
snapshot, both run `actor.send`, both write — last-writer-wins silently fork
the state machine. They also both flagged that the 60s `EVAL_TIMEOUT_MS` lived
outside the FSM, which leaked an in-flight `generateObject` HTTP call when it
fired and created a fork window where the FSM could land in
`presentingResult` while the orchestrator returned a "took too long" error.

First instinct was `SELECT FOR UPDATE` to serialise the writes. Rejected:
the lock would be held across the 10s+ AI call and convoy the connection
pool under load (Vercel Fluid Compute runs `max: 1` per instance — one stuck
conversation pins the whole instance for up to 60s).

Shipped instead:

- **Optimistic concurrency** via a `version` column on `conversations`. The
  orchestrator reads `(snapshot, version)`, runs the AI call with no DB
  connection held, then commits via `UPDATE ... WHERE id = ? AND version = ?`.
  CAS conflict throws `ConcurrentModificationError`; the action layer maps
  it to a typed product string ("This conversation changed in another tab —
  refresh to continue.").
- **FSM-owned timeout** via XState's `after` delayed transition. The
  orchestrator no longer races with the FSM — when timeout fires, XState
  cleanly transitions to `idle` and stops the invoked actor.
- **Structural cancellation.** XState's `fromPromise` signal is forwarded
  into `screen(input, { signal })` and on into `generateObject({ abortSignal })`.
  When the FSM exits `evaluating` for any reason, the in-flight HTTP call
  to OpenRouter is actually aborted, not just abandoned.
- **Real-Postgres integration test.** One Testcontainers test in
  `test/integration/orchestrator.concurrent.test.ts` verifies the SQL
  primitive serialises concurrent CAS attempts. Lives in a separate Vitest
  lane (`pnpm test:integration`) so the default `pnpm test` stays
  Docker-free.

Full rationale in [ADR 0006](./docs/adr/0006-orchestrator-concurrency.md).

The audit also produced 13 small wins around correctness, observability, and
DX: `actor.stop()` in `try/finally` on every error path, `secure` cookie flag
in production, Zod schema tightening so a malformed snapshot row can't crash
XState during rehydration, request-scoped structured logger that emits FSM
transitions and AI latency, unit tests for the proxy and Server Actions
surfaces, Codecov upload, CI gating fix so e2e waits for unit tests to pass,
Postgres connection-pool size that branches on `process.env.VERCEL`, and
explicit fixture markers for the fake-AI test escape hatch.

## What shipped on day three

After the audit shipped, the chat at `/` started feeling like a tech demo, not a
product. Day three was a platform redesign — turn the single-page chat into a
workspace.

**The routing model changed.** `/` is now the dashboard. The active chat lives at
`/screening/new`. Every verdict gets a permanent URL at `/screening/[id]`. Public
shares get an unguessable slug at `/s/[slug]` with its own bare layout (no sidebar
leak), an Open Graph card at `/s/[slug]/opengraph-image`, and a server-rendered
A4 PDF at `/s/[slug]/pdf/download` (headless Chromium via `puppeteer-core` +
`@sparticuz/chromium`).

**The verdict streams now.** `screenStreaming()` wraps `streamObject` and emits
partials through an `onPartial` callback. `dispatchStreaming()` threads it through
the orchestrator. `/api/screening/stream` is an SSE route that emits
`user-message`, `partial`, `done`, and `error` events. `<ChatStream>` consumes the
SSE response, optimistically renders the user message, progressively renders the
verdict via `<StreamingVerdict>`, and `redirect`s to `/screening/[id]` when the
stream closes. Fake-AI mode (`WORKFULLY_FAKE_AI=1`) emits 11 timed partials over
~2.5s so demos show the streaming shape without burning OpenRouter credits.

**TypeScript-enforced privacy boundary.** A new `share_links` table (128-bit
unguessable slug, `ON DELETE CASCADE`, `UNIQUE` on `screening_id`) backs the
public share. The repository layer splits into `getScreeningById` (private —
returns JD + CV + transcript) and `getScreeningForShare` (public — returns a
narrower type that omits all three). The public page literally cannot render JD
or CV — TypeScript fails the build if you try.

**Design system as a living document.** New `DESIGN.md` at the repo root captures
tokens, component contracts, responsive breakpoints, a11y rules, motion, and
dark-mode behavior. New `src/lib/domain/verdict-style.ts` is the single source of
truth for verdict color mappings — used by the dashboard, sidebar dot, screening
header, public share, OG card, and PDF page. A drift test reads `globals.css` and
asserts every CSS variable matches the constants. CI fails if they diverge.

**Tailwind 4 utility-first refactor.** Every component (~20 files) migrated from
inline `style={{ ... }}` to Tailwind utility classes generated from `@theme inline`
tokens. New utilities: `w-sidebar`, `h-header`, `shadow-pop`, `animate-fade-in`,
`animate-scale-in`. Net: zero remaining inline styles outside the `@vercel/og`
image route (which requires inline by design — `next/og` doesn't run Tailwind).

**Other day-three bits.** ⌘K palette with a hand-rolled fuzzy-match scorer (30
lines beats a 9 KB library at this scale). `ThemeToggle` with a tiny inline
`<head>` script that sets `data-theme` before React hydrates — no flash of wrong
theme on first paint. `candidateName` and `role` extracted by the model on the
same AI call, so dashboard cards show real names instead of "Untitled screening".
End-to-end coverage updated for the new routing: dashboard listing, public share
access without sidebar, share-link round-trip.

## What I'd do with another day

- **Uploaded-PDF storage.** Right now we extract text from JD/CV PDFs and discard
  the original bytes. If recruiters need to re-download what the candidate uploaded,
  push the bytes to S3 and record a key on the screening row. The verdict PDF (which
  the share page generates) is rendered on demand from data — no storage needed.
- **Screening replays.** The `screenings` table already stores JD + CV verbatim, so
  re-running an old verdict against a different model is just a worker job away.
- **Multi-tenancy.** Every row would gain a `workspace_id`; cookies would carry it.
  Routes would scope queries on it. Pure mechanical work, omitted for time.
- **Per-conversation rate limiting.** An in-flight token (Redis or in-memory if
  single-instance) would deflect concurrent dispatch attempts before they hit
  the DB at all. The CAS pattern handles correctness; this would handle
  abuse / accidental double-clicks gracefully.
- **Broader repository integration tests.** W19' shipped one Testcontainers
  case for the CAS primitive; the rest of the repo layer would benefit from
  the same treatment now that the infrastructure is in place.
- **Eval harness.** `pnpm eval` against a labeled fixture set, run on every prompt
  change. That's how you measure verdict quality without unit-testing the model.
- **Job Builder for real.** Today it returns a mock prompt — implementing it with
  the same FSM-as-source-of-truth approach would mirror the screening flow.

---

## License

MIT (this is an interview challenge response — feel free to reuse anything useful).
