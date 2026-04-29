import type { Message, Screening } from "@/lib/db/schema";
import type { ScreeningResult } from "@/lib/domain/screening";

/**
 * Walk messages and screenings together (both already sorted ascending by
 * createdAt) to attach each persisted verdict to the bot announcement message
 * that hosted it.
 *
 * The orchestrator inserts the screenings row before appending the
 * verdict-ready bot reply, so the first bot message with createdAt strictly
 * after a given screening's createdAt is the one that should display its
 * card. Walking once keeps the pairing O(N+M) and lets historical cards
 * survive later FSM transitions that clear `context.result`.
 */
export function pairScreeningsToMessages(
  messages: Pick<Message, "id" | "role" | "createdAt">[],
  screenings: Pick<Screening, "result" | "createdAt">[],
): Map<string, ScreeningResult> {
  const result = new Map<string, ScreeningResult>();
  let scrIdx = 0;
  for (const m of messages) {
    if (
      m.role === "bot" &&
      scrIdx < screenings.length &&
      m.createdAt > screenings[scrIdx]!.createdAt
    ) {
      result.set(m.id, screenings[scrIdx]!.result);
      scrIdx++;
    }
  }
  return result;
}
