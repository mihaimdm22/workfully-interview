# ADR 0002 — Architecture: layered, server-action driven

**Status:** Accepted

**Context.** Next.js gives many ways to wire a feature: API routes, Server Actions,
RPC, or a separate API server. We need one that keeps the FSM as the source of
truth, makes mutations explicit, and doesn't leak server-only code (DB, AI keys)
into the client bundle.

## Decision

A small set of **Server Actions** is the only mutation surface, calling into a
**layered `lib/`** structure with a strict dependency direction:

```
domain   ◀──  fsm   ◀──  ai
   ▲           ▲          ▲
   └───────────┼──────────┘
              app, components, server actions
```

- **`domain/`** — pure types, validators, intent classifier. No I/O. Importable
  from tests, server, and client.
- **`fsm/`** — the XState machine and orchestrator. Machine is pure; orchestrator
  is server-only and knows about DB + AI.
- **`db/`** — Drizzle schema, lazy singleton client, repository functions.
  Server-only.
- **`ai/`** — `screen()` (the LLM boundary) and `extractPdfText()`. Server-only.
- **`app/`** — Next.js routes. `actions.ts` is the only mutation entry point.
  `page.tsx` is a Server Component that reads via repos.
- **`components/`** — UI. One client component (`composer.tsx`) for the form;
  everything else is a Server Component.

`'server-only'` is imported in the right places so that an accidental client
import would fail at build time.

## Why Server Actions

| Approach              | Pros                                                                                          | Cons                                                                                |
| --------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **Server Actions**    | One function call from form, automatic CSRF, `revalidatePath` for cache, no fetch boilerplate | Newer pattern, Nextjs-specific                                                      |
| API routes (`/api/*`) | Familiar; can be hit by curl                                                                  | Forces JSON serialization, no automatic cache invalidation, more boilerplate        |
| tRPC                  | Type-safe, batchable                                                                          | Extra dep, extra layer, redundant when Server Actions already give end-to-end types |
| Separate API server   | Clean separation                                                                              | Two deployments for an interview challenge — overkill                               |

Server Actions win because:

1. The mutation flow is "user types → server runs FSM → DB persists → page revalidates".
   That's a single function — `sendTextMessage(formData)` — not three layers.
2. `revalidatePath('/')` after each mutation is one line, and the page re-renders
   from the freshly persisted FSM snapshot. No client cache to invalidate.
3. The boundary is enforced by `'use server'` at the top of `actions.ts`, not by
   us remembering to JSON-serialize.

## State management on the client

Almost none. The chat history and FSM state are owned server-side. The composer
(`src/components/composer.tsx`) is the only stateful client component, and its
state is just the form's pending/error UI. After a successful action,
`revalidatePath` re-renders the page with fresh data.

This is the boring-correct version of "RSC + Server Actions". It avoids:

- A client-side store (Redux/Zustand) duplicating server state.
- Hydration mismatches between an XState actor on the server and a different
  actor on the client.
- A websocket/SSE channel — useful for streaming verdicts later, but not needed
  for the single-turn screening flow today.

## Consequences

- **No optimistic UI** for sends (we wait for the action to complete before
  showing the bot's reply). Trade for simplicity. The screening AI call dominates
  perceived latency anyway.
- **The orchestrator is the integration point.** Anything that wants to send an
  event goes through `dispatch()`. That's intentional — adding a CLI client or
  webhook tomorrow means wiring it to `dispatch()`, not re-implementing the
  state-update logic.

## Why this answers the interview question

> "What architecture did you use and why?"

A layered server-side model where the FSM is authoritative and the only mutation
surface is Server Actions. The client renders messages and posts forms; nothing
about the conversation lives in client memory. That keeps the FSM testable
without a browser, makes the persisted snapshot meaningful (refresh = same
state), and lines up with how Next 16 wants you to write apps in 2026.
