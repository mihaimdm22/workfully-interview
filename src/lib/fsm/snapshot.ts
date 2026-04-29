import { z } from "zod";
import type { SnapshotFrom } from "xstate";
import type { botMachine } from "./machine";

/**
 * Persisted snapshot wrapper.
 *
 * XState 5 returns a structurally-typed `PersistedSnapshot` from
 * `actor.getPersistedSnapshot()` that's already JSON-serializable. We round-trip
 * it through this Zod schema at the DB boundary so a malformed row can't crash
 * the server — if validation fails, callers can choose to start a fresh actor.
 *
 * `value` and `context` are narrowed to the bot machine's actual shape so a
 * row with an unknown state name is rejected at the boundary instead of
 * crashing XState mid-rehydration. Internal XState fields (children,
 * historyValue, output, error) stay loose because XState owns those shapes.
 */
const screeningSubstateSchema = z.enum([
  // Current substates.
  "gathering",
  "evaluating",
  "presentingResult",
  // Legacy aliases — old persisted snapshots are rewritten to `gathering`
  // by `migrateLegacySnapshot` in the orchestrator, but we must still
  // accept them at the validation boundary so rehydration doesn't reject
  // pre-migration rows.
  "awaitingJobDescription",
  "awaitingCv",
]);

const stateValueSchema = z.union([
  z.literal("idle"),
  z.literal("jobBuilder"),
  z.object({ screening: screeningSubstateSchema }),
]);

const contextSchema = z
  .object({
    conversationId: z.string().min(1),
    jobDescription: z.string().optional(),
    cv: z.string().optional(),
    // result and error are validated structurally in the FSM; keep loose here
    // so a future schema bump doesn't break already-persisted rows.
    result: z.unknown().optional(),
    error: z.string().optional(),
  })
  .passthrough();

const persistedSnapshotSchema = z.object({
  status: z.enum(["active", "done", "error", "stopped"]),
  value: stateValueSchema,
  context: contextSchema,
  output: z.unknown().optional(),
  error: z.unknown().optional(),
  historyValue: z.unknown().optional(),
  children: z.record(z.string(), z.unknown()).optional(),
});

export type PersistedSnapshot = z.infer<typeof persistedSnapshotSchema>;

export type BotSnapshot = SnapshotFrom<typeof botMachine>;

export function isPersistedSnapshot(
  value: unknown,
): value is PersistedSnapshot {
  return persistedSnapshotSchema.safeParse(value).success;
}
