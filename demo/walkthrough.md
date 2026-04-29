# Walkthrough — word-for-word script

Total target time: **12–15 minutes** for the deck, **5–7 minutes** for the live demo, **5 minutes** for Q&A.

Speak in short sentences. Pause after each slide change. Don't read bullets — paraphrase them. The bullets are for the audience, the paragraphs below are for you.

---

## Slide 1 — Title

> "Hi — I'm David. I built the optional proposal from the brief: a finite-state-machine conversational bot that screens candidates against a job description.
>
> I want to spend the next fifteen minutes walking through three things: the architecture decisions I made, how I worked with AI both **inside** the product and **alongside** me as I built it, and what the testing and tooling discipline looks like. Then I'll demo the app live.
>
> The repo's at `mihaimdm22/workfully-interview`, every decision has a one-page ADR in `docs/adr/`, and I'll point at code as we go."

---

## Slide 2 — What I built

> "The brief was simple on paper: three states — IDLE, SCREENING, JOB_BUILDER — with a universal `/cancel`. Screening has its own internal flow: ask for a JD, ask for a CV, evaluate, present the result.
>
> The constraint I held myself to was this: **the finite state machine is the source of truth.** Server actions don't mutate state directly. The UI doesn't mutate state. The AI call doesn't mutate state. They all go through the FSM, which means `/cancel` does the same thing whether you're at step 2 or step 5, and a page reload puts you back exactly where you were.
>
> Job Builder is mocked, as the brief allowed."

---

## Slide 3 — The stack at a glance

> "Quick tour of the stack and why each piece is here.
>
> Next.js 16 with App Router because that matches Workfully's stack and Server Actions are the cleanest mutation surface I know of in 2026. React 19 because that's what Next 16 ships with.
>
> XState v5 for the state machine — I'll defend that choice in two slides.
>
> Postgres 17 with Drizzle, because the job description says Acme runs Postgres on RDS. I want my dev database to **be** the production database, not emulate it.
>
> Vercel AI SDK v6 with Claude Sonnet 4.6, routed through OpenRouter. The OpenRouter piece matters — I'll come back to it.
>
> Zod v4 — one schema becomes my types, my LLM constraint, and my database column shape.
>
> Vitest plus Playwright for testing, with a deterministic fake-AI mode for E2E.
>
> TypeScript 6 in strict mode, with `noUncheckedIndexedAccess` turned on. That's the strictest TS you can run.
>
> Every line item here has an ADR — `0001` through `0005`."

---

## Slide 4 — Architecture

> "The architecture is layered, server-first, with a strict dependency direction.
>
> `domain` has zero dependencies on anything else — pure types, the intent classifier, the Zod schema. It's importable from anywhere, including tests.
>
> `fsm` depends on `domain`. The state machine itself is pure. The orchestrator — which is the only file that touches FSM and DB and AI — is server-only.
>
> `db` and `ai` are also server-only. The `'server-only'` import is the build-time guarantee — if a client component accidentally imports them, the build fails.
>
> The `app` layer wires it all together. **Server Actions are the only mutation surface.** Not API routes. Not RPC. Not a separate API server. One function — `sendTextMessage(formData)` — and `revalidatePath('/')` re-renders the page from the freshly persisted snapshot. There's almost no client-side state at all."

---

## Slide 5 — The state machine

> "Here's the machine. Three top-level states, screening has four sub-states.
>
> The thing I want to draw your eye to is the parent transition: `/cancel` is wired **once, on the parent screening state**. Not on every leaf. So `/cancel` from `awaitingJD` works the same as `/cancel` from `evaluating`, and I didn't write it four times.
>
> The other piece is the `invoke` on `evaluating`. The screening AI call is modelled as an XState **actor**. The FSM enters `evaluating`, the actor runs, and the FSM transitions to `presentingResult` on success or back to `idle` on error. Both paths are declarative — there are no try/catch blocks scattered through the orchestrator."

---

## Slide 6 — Why XState

> "The challenge brief asked **how I decided to implement the state machine**. I want to answer that head-on.
>
> I considered three options: a hand-rolled discriminated union with a reducer, XState v5, and a smaller library like Robot3. The hand-rolled version is the most tempting because you can read the whole thing in fifty lines.
>
> But by the time I'd added hierarchical states for `/cancel`, persisted snapshots for resumability, and an actor model for the AI call — I'd have poorly re-implemented half of XState. So XState wins three times over:
>
> One — hierarchical states make `/cancel` a one-line transition on the parent.
>
> Two — `getPersistedSnapshot` and `createActor({ snapshot })` round-trip cleanly. Refresh the page mid-flow, the conversation comes back. No custom serializer.
>
> Three — actors are how the AI call gets modelled inside the machine. And `botMachine.provide({ actors })` lets my tests swap in a fake actor without touching the machine. **Same machine, two contexts.** That's the cleanest test seam I know."

---

## Slide 7 — AI: structured output, not string parsing

> "Here's where AI honesty starts.
>
> The screening verdict has a Zod schema — `screeningResultSchema`. It defines exactly what a verdict looks like: a verdict enum, a score 0 to 100, must-haves, nice-to-haves, strengths, gaps, and a one-sentence recommendation a recruiter could paste into Slack.
>
> The screening service calls `generateObject` from the Vercel AI SDK with that schema. The LLM is **forced** to produce JSON that satisfies the schema. If it can't, the SDK retries with corrective hints. If it still can't after retries, the call **throws** — and the FSM's error branch fires, which routes the user back to `idle` with an error message.
>
> There is no `JSON.parse` of free text anywhere in the codebase. The verdict is either a typed `ScreeningResult` or it's an error. That's the deal."

---

## Slide 8 — One Zod schema → three things

> "The reason that schema is in `domain/` and not in `ai/` is because **the same schema is used three different ways**.
>
> One — TypeScript types are inferred from it via `z.infer`. No duplication.
>
> Two — the LLM call uses it as the structured-output constraint via `generateObject`.
>
> Three — the database column for `screenings.result` is typed as `ScreeningResult` via Drizzle's `.$type` annotation.
>
> So if I want to add a new field — say, a `reasoning` field — I add it to the Zod schema in **one file**, and TypeScript, the LLM contract, and the database shape all update together. That's the discipline that keeps an LLM honest in production."

---

## Slide 9 — Provider routing through OpenRouter

> "I want to flag the OpenRouter abstraction specifically because it's the one thing I'd advocate for at Workfully too.
>
> `screen.ts` reads a single env var — `OPENROUTER_MODEL` — and passes that string to the OpenRouter provider. The default is `anthropic/claude-sonnet-4.6`, but I can flip it to `openai/gpt-4o` or `google/gemini-2.5-pro` or any model OpenRouter supports — **with zero code changes**.
>
> Why does this matter? The model market is moving fast. Anthropic, OpenAI, Google, Mistral — they leapfrog each other every few months. If your codebase is wired to one vendor's SDK, every model swap is a refactor. With OpenRouter, every model swap is an env var.
>
> One key to rotate. One billing surface. Vendor-agnostic by default. My schema doesn't move, my prompt doesn't move, my FSM doesn't move."

---

## Slide 10 — Database: Postgres + Drizzle

> "Three tables: conversations, messages, screenings.
>
> Conversations holds the FSM snapshot as JSONB. JSONB because it's indexable — I can answer questions like 'which conversations are stuck in `evaluating`?' with one SQL query. No ETL needed.
>
> Messages is append-only. The chat transcript **is** the audit log.
>
> Screenings is denormalized on purpose. JD and CV text are copied in when the verdict is produced. Why? Because if a recruiter edits the JD next month, I don't want it to retroactively invalidate every prior verdict. The screening result has to be reproducible against the inputs the model actually saw.
>
> I picked Drizzle over Prisma because the SQL stays transparent. Drizzle code looks like SQL. The bundle is twelve kilobytes instead of six megabytes. And every code review where someone asks 'show me the SQL' — Drizzle has the answer at hand."

---

## Slide 11 — Resumable conversations

> "This is the payoff of the persisted-snapshot design.
>
> On every transition, I serialize the XState snapshot and write it to Postgres in the same transaction as the message rows. On the next request, I read the snapshot back, hand it to `createActor` as the initial state, and the FSM picks up exactly where it left off.
>
> So: reload the page mid-screening — you're still in `awaitingCv`, the JD you pasted is still in the FSM's context, and you can keep going. Restart the server — same. Cookie persists across deploys.
>
> This is also the reason I have a regression test that takes a snapshot mid-flow, throws away the actor, rehydrates from the snapshot, and continues. Persistence is testable, so I tested it."

---

## Slide 12 — Testing strategy

> "The brief asked specifically for testing strategy. Here it is.
>
> Pyramid, not snowman. Most of the value at the bottom — fifty-nine pure unit tests covering every FSM transition, every intent the classifier knows about, every reply mapping, and the schema validation. Two-hundred-fifty milliseconds total.
>
> Boundary tests above that — the AI service tested with `MockLanguageModelV3` to assert behavior on output, including schema violations. The PDF extractor tested against real fixture bytes.
>
> One Playwright E2E at the top — happy path through the screening flow, deterministic because of the fake-AI mode. Coverage thresholds enforced at 80% statements, 75% branches; current coverage sits at 95%-plus.
>
> Five rules I held myself to: I test **my** FSM, not XState's framework. I test at the boundary, not the implementation. I mock at the integration point — `provide({ actors })` — not by stubbing the screen function. **One** E2E for confidence the wires are connected, not for coverage. And I do not test the model's IQ. That's an evaluation problem, not a unit-test problem."

---

## Slide 13 — `WORKFULLY_FAKE_AI=1`

> "Here's the test escape hatch I'm proudest of.
>
> When `WORKFULLY_FAKE_AI` is set to `1`, the `screen()` function bypasses OpenRouter entirely and runs a thirty-line deterministic stub that pattern-matches on the CV text. Senior CV → strong verdict. Junior CV → weak verdict. Designer CV → wrong-role verdict.
>
> Why?
>
> One — CI shouldn't depend on OpenRouter uptime or burn API budget. A flaky external dependency makes the build flaky.
>
> Two — Playwright assertions need to be precise. A real model returns slightly different text every run; you can't assert on it without making the test brittle.
>
> Three — the fake is gated on an env var. In production it's never set. The codepath is dead code in prod.
>
> So my CI runs the full E2E flow against a real Postgres in a Docker service container, with deterministic AI, in under thirty seconds. No credits spent. No flakes."

---

## Slide 14 — Repo tooling

> "I want to be transparent: most of this tooling I've standardised on across projects, and I bring the same setup wherever I work. So this is what 'production-ready' looks like to me, and it's all here.
>
> Prettier sorts the Tailwind classes. ESLint runs the Next core-web-vitals config plus TypeScript rules. TypeScript is in strictest mode with `noUncheckedIndexedAccess` — which catches a whole class of array-out-of-bounds bugs the default doesn't.
>
> Knip scans for dead code on every CI run. Husky runs `lint-staged` on commit and `commitlint` on commit-message. CodeQL runs the security-and-quality query suite on push. `actionlint` lints my GitHub Actions YAML in Docker. Dependabot bumps deps weekly, grouped by minor and patch.
>
> The CI pipeline has five jobs: lint+typecheck, test+coverage, build, end-to-end with Playwright against a real Postgres service container, and a `pnpm audit` for high-severity CVEs in production deps.
>
> Every PR goes through all of this before merge."

---

## Slide 15 — Conventional Commits

> "Conventional Commits, enforced both locally and in CI.
>
> The scope-enum is locked down: `fsm`, `ai`, `db`, `ui`, `domain`, `e2e`, `ci`, `deps`, `docs`, `config`. So you can't merge a commit that says `chore: stuff` — you have to say what part of the system you touched.
>
> The payoff is on the right: the CHANGELOG writes itself. `git log --grep '^feat'` answers 'what features did we ship this quarter'. A new engineer can read six months of git history and actually understand what changed."

---

## Slide 16 — AI in my workflow

> "I want to be honest about how I built this, because the question is fair: this is a lot of code and a lot of polish for one challenge.
>
> I built it with **Claude Code** as a paired engineer. But it's not vibe-coded — and the difference matters.
>
> Every major decision has an ADR — five of them, one to three pages each. I wrote them with the model, then iterated on them. They're real engineering decisions with real tradeoffs, not summaries.
>
> The tests came first. The state machine has full transition coverage because the test suite forced the design. When the AI proposed a transition, the test was already there to say yes or no.
>
> The schema is the contract. I wrote the Zod schema by hand, the model implemented against it, and `generateObject` enforces the same contract at runtime. Every layer of the stack speaks the same shape.
>
> Diffs went through review before commit — both a code-review agent and CodeQL. CodeQL catches what humans miss; the model catches what CodeQL misses; I catch what both miss.
>
> **The discipline matters more than the tool.** AI accelerated this work by maybe four-x. The architecture, the tests, and the ADRs are why it's shippable."

---

## Slide 17 — Demo plan

> "OK — I'm going to show this live now. I'll keep it tight, about five minutes.
>
> Stop me at any point and I can dig into any layer."

(Switch to terminal + browser. See `demo.md` for the exact commands.)

---

## Slide 18 — What I'd ship next

> "Quick list of what's missing — not because I didn't know, but because I prioritized depth over breadth.
>
> Streaming verdicts with `streamObject` — verdict appears token-by-token instead of a ten-second spinner. Big UX win, no FSM changes needed.
>
> PDF storage in S3 — right now I extract text and discard the bytes. If recruiters need to re-download what the candidate uploaded, store the bytes and record a key.
>
> Screening replays — the `screenings` table already stores JD and CV verbatim. Re-running an old verdict against a different model is one worker job.
>
> Multi-tenancy — every row gains a `workspace_id`, the cookie carries it, queries scope on it. Pure mechanical work.
>
> Repository integration tests — the pattern is there; I'd run them against a Testcontainers Postgres in CI.
>
> Eval harness — `pnpm eval` against a labeled fixture set, run on every prompt change. That's how you measure verdict quality without unit-testing the model.
>
> Job Builder for real — same FSM-as-source-of-truth approach mirrored from screening."

---

## Slide 19 — Thank you

> "That's the deck. Repo and ADRs are linked here. Three commands to run it locally.
>
> Happy to take questions on any of it — the FSM, the AI integration, the testing, the tooling, or how I worked with Claude Code through the build."

---

## Anticipated questions — keep these answers ready

**"Why not just use a single API route and a global state object?"**

> "Because the FSM is the contract. A single mutation function is fine — but the moment you have parent-level transitions like `/cancel`, sub-states like `awaitingCv`, and async work like the AI call, you want a state machine. The cost is one dependency; the benefit is exhaustive testability and free persistence."

**"How do you handle a model that ignores your schema?"**

> "Three layers. One — `generateObject` retries up to twice with corrective hints when the model produces invalid JSON. Two — if it still fails, the call throws, the FSM moves to its error branch, the user sees a friendly message, and we don't fabricate a result. Three — temperature is at 0.2 to keep verdicts consistent. In practice, with Claude Sonnet 4.6, I haven't seen a schema violation."

**"What if the screening takes longer than your timeout?"**

> "60-second timeout in the orchestrator. If the actor doesn't resolve in time, `waitFor` rejects, the orchestrator catches it, and the user sees an error. The FSM lands back in `idle` with the error preserved in context."

**"Why no streaming?"**

> "Cost-benefit for a single-turn interaction. The screening AI call is around ten seconds end-to-end. Streaming would be a UX upgrade — you'd see the verdict appear progressively — but it doesn't change the contract. `streamObject` is a drop-in replacement when I want it."

**"How would this scale?"**

> "Three answers. One — Postgres scales fine for this workload; the hot path is single-row reads and writes. Two — the AI call is the latency bottleneck, so caching identical JD+CV pairs is a quick win. Three — the FSM snapshot in JSONB is queryable for ops dashboards: stuck conversations, average time-in-state, error rates. None of that requires a redesign."

**"Why OpenRouter and not the Anthropic SDK directly?"**

> "Vendor abstraction at the boundary. Same schema, same prompt, same FSM — but the model is one env var. When Workfully wants to evaluate GPT-5 or Gemini 3 against the same screening prompt, it's a five-minute change instead of a sprint."

**"What's the `WORKFULLY_FAKE_AI` thing — isn't that a code smell?"**

> "Fair question. It's an env-gated escape hatch with a thirty-line implementation. It exists for two reasons: deterministic E2E tests and zero-cost CI. It's never set in production — the env var simply isn't there — so the codepath is unreachable. The alternative is mocking deeper in the SDK or running CI against a real model, both of which are worse tradeoffs for a project of this size."

**"Did Claude write all of this?"**

> "Claude wrote a lot of it. I wrote the ADRs and the test list and reviewed every diff. The architecture is mine. The discipline is mine. AI without discipline ships garbage; discipline without AI ships slowly. I wanted to ship something solid in the time I had, and that meant using the best tools available."
