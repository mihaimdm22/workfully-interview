import { z } from "zod";
import type { SnapshotFrom } from "xstate";
import type { botMachine } from "./machine";

/**
 * Persisted snapshot wrapper.
 *
 * XState 5 returns a structurally-typed `PersistedSnapshot` from
 * `actor.getPersistedSnapshot()` that's already JSON-serializable. We round-trip it
 * through this Zod schema at the DB boundary so a malformed row can't crash the
 * server — if validation fails, callers can choose to start a fresh actor.
 */
const persistedSnapshotSchema = z.object({
  status: z.enum(["active", "done", "error", "stopped"]),
  value: z.unknown(),
  context: z.unknown(),
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
