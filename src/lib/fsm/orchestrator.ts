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
import { screen, screenStreaming, type ScreenOutput } from "@/lib/ai/screen";
import {
  resolveScreenConfig,
  type ResolvedScreenConfig,
} from "@/lib/ai/resolve-config";
import { createLogger, stateString } from "@/lib/log";
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
  /**
   * If this dispatch produced a new screening row (verdict went from
   * undefined → present), the new row's id. Callers (server actions) use
   * this to redirect the user to /screening/[id] when the AI is done.
   */
  newScreeningId?: string;
}

type ScreenMeta = { model: string; latencyMs: number };

interface RequestContext {
  meta: { lastScreen: ScreenMeta | null };
  /**
   * Optional streaming hook. When set, the screening actor calls
   * `screenStreaming()` and forwards each partial via this callback. Set
   * exclusively by `dispatchStreaming` — atomic `dispatch` callers leave
   * this null and the actor uses `screen()`.
   */
  onPartial: ((partial: Partial<ScreeningResult>) => void) | null;
  /**
   * Resolved AI config for this dispatch — model, retries, temperature,
   * timeout. Read once at the top of `dispatchInternal` and threaded into
   * the screening actor + FSM context. Null on read-only paths
   * (`startConversation`, `loadConversation`) where no AI call happens.
   */
  config: ResolvedScreenConfig | null;
}

/**
 * Build a request-scoped machine. The screening actor closes over a per-request
 * mutable holder so the orchestrator can pull metadata (model, latency) after the
 * actor resolves, without resorting to module-level globals.
 *
 * `signal` from XState's `fromPromise` is forwarded to the AI call so that
 * when the FSM exits `evaluating` (e.g., the `after` timeout fires), the
 * in-flight call is actually cancelled — not just abandoned.
 */
function machineForRequest(ctx: RequestContext) {
  return botMachine.provide({
    actors: {
      screen: fromPromise<
        ScreeningResult,
        { jobDescription: string; cv: string }
      >(async ({ input, signal }) => {
        // The dispatch path always sets ctx.config before running the actor;
        // null only happens on read-only paths that don't reach this code.
        const cfg = ctx.config;
        const screenDeps = {
          signal,
          modelId: cfg?.model,
          maxRetries: cfg?.maxRetries,
          temperature: cfg?.temperature,
        };
        const out: ScreenOutput = ctx.onPartial
          ? await screenStreaming(input, {
              ...screenDeps,
              onPartial: ctx.onPartial,
            })
          : await screen(input, screenDeps);
        ctx.meta.lastScreen = { model: out.model, latencyMs: out.latencyMs };
        return out.result;
      }),
    },
  });
}

function newRequestContext(
  onPartial: RequestContext["onPartial"] = null,
  config: ResolvedScreenConfig | null = null,
): RequestContext {
  return { meta: { lastScreen: null }, onPartial, config };
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
 * Stamps the freshly resolved evaluation timeout into a persisted snapshot's
 * context before rehydration. Lets a settings-modal change take effect on
 * the next dispatch without touching the rest of the snapshot. Legacy
 * snapshots lacked the field entirely; new dispatches always carry it.
 */
function withFreshTimeout(
  snap: PersistedSnapshot,
  evalTimeoutMs: number,
): PersistedSnapshot {
  const ctx: Record<string, unknown> =
    snap.context && typeof snap.context === "object"
      ? (snap.context as Record<string, unknown>)
      : {};
  // Cast through `unknown` because TS narrows the spread literal and drops
  // the index signature, even though the runtime shape is correct (the
  // input snapshot's context is already structurally valid; we're only
  // stamping `evalTimeoutMs` on top).
  const merged = {
    ...ctx,
    evalTimeoutMs,
  } as unknown as PersistedSnapshot["context"];
  return { ...snap, context: merged };
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

export async function dispatch(input: DispatchInput): Promise<DispatchResult> {
  return dispatchInternal(input, null);
}

/**
 * Streaming sibling of `dispatch`. Same semantics — drives the FSM, persists
 * the snapshot, returns the final state — but additionally forwards each
 * partial verdict to `onPartial` while the AI call is in flight. The SSE
 * route handler uses this so the client can render progressive reveal.
 *
 * `onPartial` only fires when the FSM transitions through `evaluating`. For
 * dispatches that don't trigger AI (gathering, /cancel, /reset), it's never
 * called — same shape as the atomic path.
 */
export async function dispatchStreaming(
  input: DispatchInput,
  onPartial: (partial: Partial<ScreeningResult>) => void,
): Promise<DispatchResult> {
  return dispatchInternal(input, onPartial);
}

async function dispatchInternal(
  { conversationId, event, userMessage, attachment }: DispatchInput,
  onPartial: ((partial: Partial<ScreeningResult>) => void) | null,
): Promise<DispatchResult> {
  const log = createLogger(conversationId);
  const dispatchStart = Date.now();
  const convo = await getConversation(conversationId);
  if (!convo) throw new Error(`Conversation not found: ${conversationId}`);

  if (!isPersistedSnapshot(convo.fsmSnapshot)) {
    throw new Error("Persisted FSM snapshot is malformed");
  }
  // Resolve runtime config (model + timeout + retries + temperature) once per
  // dispatch. The resolver layers env > db > default, so settings-modal
  // changes apply to the *next* screening even if mid-flight ones use
  // whatever was set when they started.
  const config = await resolveScreenConfig();
  // Override the persisted snapshot's evalTimeoutMs with the freshly
  // resolved value so an in-flight settings change reaches the FSM. New
  // snapshots already carry the field; legacy ones get it implanted here.
  const persistedInput = withFreshTimeout(
    migrateLegacySnapshot(convo.fsmSnapshot),
    config.timeoutMs,
  );
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

  const ctx = newRequestContext(onPartial, config);
  const machine = machineForRequest(ctx);
  const actor = createActor(machine, {
    input: { conversationId, evalTimeoutMs: config.timeoutMs },
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
    log.info({
      event: "fsm.transition",
      from: stateString(before.value),
      to: stateString(after.value),
      ms: ctx.meta.lastScreen?.latencyMs,
      model: ctx.meta.lastScreen?.model,
    });
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
  let newScreeningId: string | undefined;
  if (
    justFinishedScreening &&
    after.context.result &&
    after.context.jobDescription &&
    after.context.cv
  ) {
    newScreeningId = await recordScreening({
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

  log.info({
    event: "fsm.dispatch.done",
    ms: Date.now() - dispatchStart,
    state: stateString(after.value),
    hasResult: after.context.result !== undefined,
    hasError: after.context.error !== undefined,
  });

  return {
    conversationId,
    state: after.value,
    context: after.context,
    reply,
    result: after.context.result,
    error: after.context.error,
    newScreeningId,
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
