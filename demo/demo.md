# Live demo — exact commands and beats

Total target: **5–7 minutes**. Keep moving.

## Pre-demo prep (do this BEFORE you start presenting)

```bash
cd /Users/mihaimdm/conductor/workspaces/workfully-interview/conakry-v2

# 1. Install deps (one-time)
pnpm install

# 2. Start Postgres
pnpm db:up
pnpm db:migrate

# 3. Make sure .env has OPENROUTER_API_KEY for the "real AI" demo
cp .env.example .env       # if not already done
#   then edit .env and paste your OPENROUTER_API_KEY

# 4. Pre-warm the dev server in a separate terminal so the demo doesn't wait
pnpm dev                   # → http://localhost:3000

# 5. Have a SECOND terminal open at the project root for tests + WORKFULLY_FAKE_AI
```

Open these tabs/files ahead of time:

- Browser: `http://localhost:3000`
- Editor: `src/lib/fsm/machine.ts`
- Editor: `src/lib/domain/screening.ts`
- Editor: `src/lib/ai/screen.ts`
- Editor: `src/lib/fsm/machine.test.ts`
- Finder/Explorer: `fixtures/` (so you can drag `cv-strong-match.pdf` into the composer)

Have the deck on a second monitor or in the background.

---

## Beat 1 — The FSM (60 seconds)

> "Before I show the running app, look at the machine itself."

Open `src/lib/fsm/machine.ts`. Scroll to the `screening` state.

Point at:

```ts
screening: {
  initial: "awaitingJobDescription",
  on: {
    CANCEL: { target: "idle", actions: "clearScreening" },  // ← here
  },
```

> "This one line is what makes `/cancel` work from any sub-state. I don't have to wire it on `awaitingJD`, `awaitingCv`, `evaluating`, and `presentingResult` separately — XState does it because of state hierarchy."

Scroll down to `evaluating`.

```ts
evaluating: {
  invoke: {
    src: "screen",                                  // ← actor by name
    onDone: { target: "presentingResult", ... },
    onError: { target: "#bot.idle", actions: [...] },
  },
},
```

> "The AI call is an `invoke`d actor. The machine declares **what** happens, not **how**. The orchestrator provides the real implementation; tests provide a fake. Same machine."

---

## Beat 2 — One schema, three uses (45 seconds)

Open `src/lib/domain/screening.ts`.

> "This Zod schema is the contract for the screening verdict. It's used in three places."

Switch to `src/lib/ai/screen.ts`. Point at:

```ts
const { object } = await generateObject({
  model,
  schema: screeningResultSchema,    // ← (1) LLM constraint
  ...
});
```

Switch to `src/lib/db/schema.ts` (briefly):

```ts
result: jsonb("result").$type<ScreeningResult>(),  // ← (2) DB column type
```

Switch back to `screening.ts`:

```ts
export type ScreeningResult = z.infer<typeof screeningResultSchema>; // ← (3) TS types
```

> "One file. Three uses. Change a field — types, LLM contract, DB shape all update together."

---

## Beat 3 — The app (3 minutes — the showpiece)

Switch to the browser at `http://localhost:3000`.

> "Here's the running app. Default state is IDLE."

Point at the **state pill** in the UI (top-right or wherever it renders).

Type in the composer:

```
hi
```

> "Bot greets, lists commands. The FSM stays in IDLE because 'hi' isn't a known command."

Type:

```
/screen
```

> "FSM transitioned to SCREENING → awaitingJobDescription. Watch the state pill update."

Drag `fixtures/job-description.pdf` into the composer (or paste JD text).

> "I extract text from the PDF on the server with `unpdf`, then send `PROVIDE_TEXT` to the FSM. Now we're in `awaitingCv`."

**Reload the page now.**

> "Page reload. Server has no in-memory state. We're still in `awaitingCv`, the JD is still in the FSM context. That's the persisted snapshot — XState's `getPersistedSnapshot` round-tripped through Postgres JSONB."

Drag `fixtures/cv-strong-match.pdf` into the composer.

> "Now we're in `evaluating`. The FSM invokes the screening actor, which calls Claude via OpenRouter. About ten seconds…"

Wait for the verdict card to render.

> "Structured verdict: verdict='strong', score, must-haves with evidence, gaps, recommendation. That's not parsed text — it's a typed `ScreeningResult` validated by the schema before it ever reached this card."

Type:

```
/cancel
```

> "Back to IDLE. Verdict cleared. Ready for the next conversation."

(Optional — if time permits, show the wrong-role flow):

```
/screen
```

Drag `fixtures/job-description.pdf`, then `fixtures/cv-wrong-role.pdf`.

> "Verdict: 'wrong_role'. The model uses that verdict sparingly because the system prompt tells it to."

---

## Beat 4 — Tests (60 seconds)

Switch to the second terminal:

```bash
pnpm test
```

> "Fifty-nine tests, two-hundred-fifty milliseconds. FSM transitions, intent classifier, replies, schema validation, snapshot rehydration, AI service via `MockLanguageModelV3`, PDF extraction."

Open `src/lib/fsm/machine.test.ts` and scroll to the snapshot rehydration test:

> "This test takes a snapshot mid-flow, throws away the actor, rehydrates, and continues. That's how I prove resumability. The persistence isn't an emergent property — it's tested."

Run:

```bash
pnpm check
```

> "This is what every PR runs locally before commit: format check, lint, typecheck, knip dead-code scan, full test suite. CI runs the same plus build, E2E, and security audit."

(If `pnpm check` is slow, just say what it does and skip running it.)

---

## Beat 5 — Fake AI for E2E (45 seconds)

Stop the dev server (`Ctrl+C` in terminal 1).

Restart with:

```bash
WORKFULLY_FAKE_AI=1 pnpm dev
```

> "Same app. But now the screening service runs a thirty-line deterministic stub instead of calling OpenRouter."

In the browser, run the screening flow again with `cv-strong-match.pdf`.

> "Verdict comes back instantly — no API call. The verdict text says `[FAKE]` so it's obvious. This is what Playwright runs in CI: deterministic, free, fast."

Open `e2e/screening.spec.ts` briefly.

> "One end-to-end happy-path. Walks through `/screen`, paste, paste, assert verdict card. With the fake AI, the assertion can be precise. With the real model, every run produces slightly different text."

---

## Beat 6 — Wrap (30 seconds)

Switch back to the deck. Land on slide 18 ("What I'd ship next").

> "That's the demo. The full feature surface, the tests that prove it, and the tooling that gates every PR. Anything you want me to dig deeper on?"

---

## If something breaks during the demo

| Symptom                         | Recovery                                                                            |
| ------------------------------- | ----------------------------------------------------------------------------------- |
| OpenRouter is slow / timing out | Switch to `WORKFULLY_FAKE_AI=1 pnpm dev`. Mention the test escape hatch.            |
| Postgres container died         | `pnpm db:up && pnpm db:migrate`. Reload the page.                                   |
| Cookie weirdness                | Browser → DevTools → Application → Cookies → delete the `workfully_conv_id` cookie. |
| PDF parsing fails on a non-PDF  | Just paste text instead. The composer accepts both.                                 |
| Page won't load after pull      | `pnpm install` (deps may have changed), then `pnpm dev`.                            |

If you genuinely can't recover, fall back to **the slides** and walk through the FSM diagram + a screenshot of a previously-captured verdict card. Don't waste interview time troubleshooting live.

---

## Polish — small things that read well in interview

- **Keep your hands off the keyboard during transitions.** Talk first, then click.
- **Read state pill changes out loud.** `"Now we're in awaitingCv."` It signals you know exactly what the system is doing.
- **Time-box yourself.** If beat 3 is dragging, skip to beat 5 — `WORKFULLY_FAKE_AI` is cooler than the wrong-role demo.
- **End on a question, not a summary.** "What part do you want me to dig deeper on?" gets better engagement than "any questions?"
