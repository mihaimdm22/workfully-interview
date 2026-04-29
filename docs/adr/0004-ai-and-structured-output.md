# ADR 0004 — AI: Vercel AI SDK + Claude (via OpenRouter) + structured output

**Status:** Accepted (revised — provider routing moved to OpenRouter)

**Context.** The screening step has to compare a JD against a CV and produce a
verdict that the UI renders as a card (verdict, score, must-haves, gaps,
recommendation). The model has to pick: which AI provider, how to call it, how to
get structured output, where the prompt lives.

## Decisions

### Provider: Claude Sonnet 4.6 routed via OpenRouter

- Cost-effective, strong reasoning for evaluation tasks, fits in a few seconds.
- OpenRouter sits in front of every major vendor; the same API key and call
  surface lets us A/B different models (`anthropic/claude-sonnet-4.6`,
  `openai/gpt-4o`, `google/gemini-2.5-pro`, …) without code changes — only the
  `OPENROUTER_MODEL` env var moves.
- Single billing surface, single key to rotate, vendor-agnostic by default.

### Library: Vercel AI SDK v6 (`ai` + `@openrouter/ai-sdk-provider`)

| Option                     | Pros                                                                                                                    | Cons                                                                    |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **Vercel AI SDK** (chosen) | Provider-agnostic; `generateObject` with Zod schema; first-class streaming for later; mocking via `MockLanguageModelV3` | Newer; opinionated APIs                                                 |
| Anthropic SDK direct       | Lowest level, official                                                                                                  | Provider lock-in, no native structured-output retries, more boilerplate |
| LangChain                  | Many integrations                                                                                                       | Heavy abstractions; structured output less ergonomic; bundle size       |

The decisive feature is `generateObject({ schema: zodSchema })`. The model is
forced to emit JSON satisfying our `screeningResultSchema`. If it can't, the SDK
retries with corrective hints; if it still can't, it throws. We never parse
free-text — the verdict is either a typed `ScreeningResult` or an error to the
FSM's error path.

### Schema as the single source of truth

`src/lib/domain/screening.ts` defines:

```ts
export const screeningResultSchema = z.object({...});
export type ScreeningResult = z.infer<typeof screeningResultSchema>;
```

That schema is used three ways:

1. The LLM call uses it to constrain output.
2. TypeScript types are inferred from it (no duplication).
3. The DB column (`screenings.result JSONB`) is typed as `ScreeningResult` via
   Drizzle's `.$type<>()`.

Change the schema in one file → LLM, types, and DB shape all update together.

### Prompt is in code, versioned with git

The system prompt and the user prompt template live in `src/lib/ai/screen.ts`.
Calibration rules ("strong = all must-haves matched", "wrong_role used sparingly")
are part of the system prompt because they're load-bearing for verdict
consistency.

I considered prompt-management tools (Helicone, PromptLayer) but they're
overkill for one prompt. When we have multiple prompts that vary by tenant,
that's the time to introduce one.

### Test mode (`WORKFULLY_FAKE_AI=1`)

`screen()` checks an env var. When set, it bypasses OpenRouter and returns a
deterministic verdict based on simple keyword heuristics over the CV text. The
heuristics are tuned to the three sample CVs (strong / weak / wrong-role) so the
E2E test produces stable output without burning API credits or depending on
network reachability.

This is documented and clearly off in production. See [`0005-testing-strategy.md`](./0005-testing-strategy.md).

## Consequences

- The screening verdict is _always_ schema-valid or the screening fails. There's no
  "model said something weird, let's try to parse it" code path.
- Provider swap is a single env-var change (`OPENROUTER_MODEL`) — no code edits.
  The schema, prompt, and FSM don't move.
- Streaming verdicts (`streamObject`) is a future enhancement that doesn't require
  any FSM changes — the actor would just resolve later.

## Why this answers an unstated interview question

> "How do you keep an LLM honest in a product?"

By treating it as a function with a typed return value. `generateObject` + Zod
schema turns the LLM into "produce a `ScreeningResult` or throw". The orchestrator
deals with the throw; the UI deals with the typed result; nothing in between has
to wonder if the JSON is valid.
