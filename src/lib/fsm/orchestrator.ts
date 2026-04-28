import "server-only";
import { createActor, fromPromise, waitFor } from "xstate";
import { botMachine, type BotEvent } from "./machine";
import {
  isPersistedSnapshot,
  type PersistedSnapshot,
  type BotSnapshot,
} from "./snapshot";
import { promptForState } from "./replies";
import {
  appendMessage,
  createConversation,
  getConversation,
  recordScreening,
  updateConversationSnapshot,
} from "@/lib/db/repositories";
import { screen, type ScreenOutput } from "@/lib/ai/screen";
import type { ScreeningResult } from "@/lib/domain/screening";

/**
 * Server-side bridge: FSM ↔ DB ↔ AI.
 *
 * One public entrypoint per request: `dispatch(conversationId, event, userMessage)`.
 *
 * Inside, we:
 *   1. Hydrate the FSM from the conversation's persisted snapshot.
 *   2. Provide a real screening actor (the `fromPromise` calls Anthropic).
 *   3. Send the event, await any async invoke.
 *   4. Persist the new snapshot + transcript messages atomically-ish.
 *
 * The orchestrator is the only place that knows about both the FSM and the AI.
 * Everything else stays pure.
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

const EVAL_TIMEOUT_MS = 60_000;

type ScreenMeta = { model: string; latencyMs: number };

interface RequestContext {
  meta: { lastScreen: ScreenMeta | null };
}

/**
 * Build a request-scoped machine. The screening actor closes over a per-request
 * mutable holder so the orchestrator can pull metadata (model, latency) after the
 * actor resolves, without resorting to module-level globals.
 */
function machineForRequest(ctx: RequestContext) {
  return botMachine.provide({
    actors: {
      screen: fromPromise<
        ScreeningResult,
        { jobDescription: string; cv: string }
      >(async ({ input, signal }) => {
        if (signal?.aborted) throw new Error("Aborted");
        const out: ScreenOutput = await screen(input);
        ctx.meta.lastScreen = { model: out.model, latencyMs: out.latencyMs };
        return out.result;
      }),
    },
  });
}

function newRequestContext(): RequestContext {
  return { meta: { lastScreen: null } };
}

export async function startConversation(): Promise<DispatchResult> {
  const ctx = newRequestContext();
  const machine = machineForRequest(ctx);
  const tempId = "pending";
  const actor = createActor(machine, { input: { conversationId: tempId } });
  actor.start();
  const snapshot = actor.getPersistedSnapshot() as PersistedSnapshot;
  actor.stop();

  const convo = await createConversation(snapshot);

  const reply = promptForState(snapshot.value as BotSnapshot["value"]);
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
    snapshot: convo.fsmSnapshot as Parameters<
      typeof createActor<typeof machine>
    >[1] extends infer O
      ? O extends { snapshot?: infer S }
        ? S
        : never
      : never,
  });
  actor.start();

  // Capture snapshots before & after for screening detection.
  const before = actor.getSnapshot() as BotSnapshot;
  actor.send(event);

  // If we entered `evaluating`, wait until we leave it (success or error path).
  let after = actor.getSnapshot() as BotSnapshot;
  if (after.matches({ screening: "evaluating" })) {
    after = (await waitFor(
      actor,
      (snap) => !snap.matches({ screening: "evaluating" }),
      {
        timeout: EVAL_TIMEOUT_MS,
      },
    )) as BotSnapshot;
  }

  const persisted = actor.getPersistedSnapshot() as PersistedSnapshot;
  actor.stop();

  await updateConversationSnapshot(conversationId, persisted);

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

  const ctx = newRequestContext();
  const machine = machineForRequest(ctx);
  const actor = createActor(machine, {
    input: { conversationId },
    // XState's snapshot generic uses inferred internal types; our zod-validated
    // PersistedSnapshot is structurally identical, so we cast at the boundary.
    snapshot: convo.fsmSnapshot as Parameters<
      typeof createActor<typeof machine>
    >[1] extends infer O
      ? O extends { snapshot?: infer S }
        ? S
        : never
      : never,
  });
  actor.start();
  const snap = actor.getSnapshot() as BotSnapshot;
  actor.stop();

  return { state: snap.value, context: snap.context };
}

function renderReply(snap: BotSnapshot): string {
  if (snap.context.error) {
    return `Sorry, the screening failed: ${snap.context.error}\n\n${promptForState(snap.value)}`;
  }
  if (
    snap.value === "idle" &&
    snap.context.result === undefined &&
    snap.context.jobDescription === undefined
  ) {
    return promptForState(snap.value);
  }
  return promptForState(snap.value);
}
