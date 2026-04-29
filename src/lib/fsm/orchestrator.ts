import "server-only";
import { createActor, fromPromise, waitFor } from "xstate";
import { botMachine, type BotEvent } from "./machine";
import {
  isPersistedSnapshot,
  type PersistedSnapshot,
  type BotSnapshot,
} from "./snapshot";
import { promptForSnapshot, promptForState } from "./replies";
import {
  appendMessage,
  createConversation,
  getConversation,
  recordScreening,
  updateConversationSnapshotIfVersion,
} from "@/lib/db/repositories";
import { screen, type ScreenOutput } from "@/lib/ai/screen";
import type { ScreeningResult } from "@/lib/domain/screening";

/**
 * Server-side bridge: FSM ↔ DB ↔ AI.
 *
 * One public entrypoint per request: `dispatch(conversationId, event, userMessage)`.
 *
 * Inside, we:
 *   1. Hydrate the FSM from the conversation's persisted snapshot + version.
 *   2. Provide a real screening actor (`fromPromise` calls the LLM via
 *      OpenRouter, forwarding XState's `signal` so the FSM can abort).
 *   3. Send the event and `waitFor` a non-evaluating state. The FSM owns the
 *      timeout (XState `after`); the orchestrator does not race with it.
 *   4. Persist the new snapshot via optimistic CAS — `UPDATE ... WHERE
 *      version = expectedVersion`. If another request wrote in between we
 *      throw `ConcurrentModificationError` and let the caller decide what to
 *      tell the user.
 *
 * No transaction wraps the AI call. The CAS write is short, runs outside any
 * LLM call, and the version column carries the same correctness guarantee
 * without holding a connection across a 60s network call. See ADR 0006.
 */

interface DispatchInput {
  conversationId: string;
  event: BotEvent;
  /** Raw user-typed text to record in the transcript. Optional — system events skip it. */
  userMessage?: string;
  attachment?: { name: string; bytes: number };
}

interface DispatchResult {
  conversationId: string;
  state: BotSnapshot["value"];
  context: BotSnapshot["context"];
  reply: string;
  result?: ScreeningResult;
  error?: string;
}

type ScreenMeta = { model: string; latencyMs: number };

interface RequestContext {
  meta: { lastScreen: ScreenMeta | null };
}

/**
 * Build a request-scoped machine. The screening actor closes over a per-request
 * mutable holder so the orchestrator can pull metadata (model, latency) after the
 * actor resolves, without resorting to module-level globals.
 *
 * `signal` from XState's `fromPromise` is forwarded to `screen()` so that
 * when the FSM exits `evaluating` (e.g., the `after` timeout fires), the
 * in-flight `generateObject` call is actually cancelled — not just
 * abandoned.
 */
function machineForRequest(ctx: RequestContext) {
  return botMachine.provide({
    actors: {
      screen: fromPromise<
        ScreeningResult,
        { jobDescription: string; cv: string }
      >(async ({ input, signal }) => {
        const out: ScreenOutput = await screen(input, { signal });
        ctx.meta.lastScreen = { model: out.model, latencyMs: out.latencyMs };
        return out.result;
      }),
    },
  });
}

function newRequestContext(): RequestContext {
  return { meta: { lastScreen: null } };
}

/**
 * Rewrites legacy state values (`awaitingJobDescription`, `awaitingCv`) to the
 * unified `gathering` substate before XState rehydrates. XState 5 doesn't fire
 * eventless transitions on rehydrate, so an in-machine alias wouldn't catch
 * these — we have to normalize at the boundary.
 */
function migrateLegacySnapshot(raw: PersistedSnapshot): PersistedSnapshot {
  const value = raw.value;
  if (
    value &&
    typeof value === "object" &&
    "screening" in value &&
    (value.screening === "awaitingJobDescription" ||
      value.screening === "awaitingCv")
  ) {
    return { ...raw, value: { screening: "gathering" } };
  }
  return raw;
}

/**
 * Create a fresh conversation row. If `id` is provided (the cookie value set by
 * middleware), the row is created with that exact id so cookie ↔ DB stay in
 * lockstep. Otherwise nanoid-generated.
 */
export async function startConversation(id?: string): Promise<DispatchResult> {
  const ctx = newRequestContext();
  const machine = machineForRequest(ctx);
  const seedId = id ?? "pending";
  const actor = createActor(machine, { input: { conversationId: seedId } });
  actor.start();
  const snapshot = actor.getPersistedSnapshot() as PersistedSnapshot;
  actor.stop();

  const convo = await createConversation(snapshot, id);

  const reply = promptForState(
    snapshot.value as BotSnapshot["value"],
    snapshot.context as BotSnapshot["context"],
  );
  await appendMessage({
    conversationId: convo.id,
    role: "bot",
    content: reply,
  });

  return {
    conversationId: convo.id,
    state: snapshot.value as BotSnapshot["value"],
    context: snapshot.context as BotSnapshot["context"],
    reply,
  };
}

export async function dispatch({
  conversationId,
  event,
  userMessage,
  attachment,
}: DispatchInput): Promise<DispatchResult> {
  const convo = await getConversation(conversationId);
  if (!convo) throw new Error(`Conversation not found: ${conversationId}`);

  if (!isPersistedSnapshot(convo.fsmSnapshot)) {
    throw new Error("Persisted FSM snapshot is malformed");
  }
  const persistedInput = migrateLegacySnapshot(convo.fsmSnapshot);
  const expectedVersion = convo.version;

  // Append user message first so it shows up even if the AI call later throws.
  if (userMessage) {
    await appendMessage({
      conversationId,
      role: "user",
      content: userMessage,
      attachmentName: attachment?.name ?? null,
      attachmentBytes: attachment?.bytes ?? null,
    });
  }

  const ctx = newRequestContext();
  const machine = machineForRequest(ctx);
  const actor = createActor(machine, {
    input: { conversationId },
    // XState's snapshot generic uses inferred internal types; our zod-validated
    // PersistedSnapshot is structurally identical, so we cast at the boundary.
    snapshot: persistedInput as Parameters<
      typeof createActor<typeof machine>
    >[1] extends infer O
      ? O extends { snapshot?: infer S }
        ? S
        : never
      : never,
  });
  actor.start();

  // try/finally so any throw between actor.start() and getPersistedSnapshot()
  // still releases the actor's timers and subscriptions. waitFor below is
  // unbounded — the FSM's `after` transition owns the timeout, so a stalled
  // AI call lands cleanly in `idle` with a typed error rather than waitFor
  // rejecting from the orchestrator's side.
  let persisted: PersistedSnapshot;
  let before: BotSnapshot;
  let after: BotSnapshot;
  try {
    before = actor.getSnapshot() as BotSnapshot;
    actor.send(event);

    // If we entered `evaluating`, wait until we leave it via either
    // onDone, onError, or the FSM-owned `after` timeout.
    after = actor.getSnapshot() as BotSnapshot;
    if (after.matches({ screening: "evaluating" })) {
      after = (await waitFor(
        actor,
        (snap) => !snap.matches({ screening: "evaluating" }),
      )) as BotSnapshot;
    }

    persisted = actor.getPersistedSnapshot() as PersistedSnapshot;
  } finally {
    actor.stop();
  }

  // Compare-and-swap on `version`. If another request wrote the conversation
  // in between, this throws `ConcurrentModificationError` and the action
  // layer maps it to a refresh-prompt for the user.
  await updateConversationSnapshotIfVersion(
    conversationId,
    persisted,
    expectedVersion,
  );

  // If a screening just produced a result, persist it.
  const justFinishedScreening =
    before.matches({ screening: "evaluating" }) === false &&
    after.matches({ screening: "presentingResult" }) &&
    after.context.result !== undefined;
  if (
    justFinishedScreening &&
    after.context.result &&
    after.context.jobDescription &&
    after.context.cv
  ) {
    await recordScreening({
      conversationId,
      jobDescription: after.context.jobDescription,
      cv: after.context.cv,
      result: after.context.result,
      model: ctx.meta.lastScreen?.model ?? "unknown",
      latencyMs: ctx.meta.lastScreen?.latencyMs ?? 0,
    });
  }

  const reply = renderReply(after);
  await appendMessage({
    conversationId,
    role: "bot",
    content: reply,
  });

  return {
    conversationId,
    state: after.value,
    context: after.context,
    reply,
    result: after.context.result,
    error: after.context.error,
  };
}

export async function loadConversation(conversationId: string): Promise<{
  state: BotSnapshot["value"];
  context: BotSnapshot["context"];
} | null> {
  const convo = await getConversation(conversationId);
  if (!convo || !isPersistedSnapshot(convo.fsmSnapshot)) return null;
  const persistedInput = migrateLegacySnapshot(convo.fsmSnapshot);

  const ctx = newRequestContext();
  const machine = machineForRequest(ctx);
  const actor = createActor(machine, {
    input: { conversationId },
    // XState's snapshot generic uses inferred internal types; our zod-validated
    // PersistedSnapshot is structurally identical, so we cast at the boundary.
    snapshot: persistedInput as Parameters<
      typeof createActor<typeof machine>
    >[1] extends infer O
      ? O extends { snapshot?: infer S }
        ? S
        : never
      : never,
  });
  actor.start();
  // try/finally so a thrown getSnapshot (e.g., from a malformed rehydration)
  // can't leave the actor running.
  try {
    const snap = actor.getSnapshot() as BotSnapshot;
    return { state: snap.value, context: snap.context };
  } finally {
    actor.stop();
  }
}

function renderReply(snap: BotSnapshot): string {
  if (snap.context.error) {
    return `Sorry, the screening failed: ${snap.context.error}\n\n${promptForSnapshot(snap)}`;
  }
  return promptForSnapshot(snap);
}
