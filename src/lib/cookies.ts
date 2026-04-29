import "server-only";
import { cookies } from "next/headers";

/**
 * Conversation cookie helpers.
 *
 * The cookie is **minted by middleware** (`src/middleware.ts`) on first visit
 * — Next 16 forbids cookie writes from Server Component renders. These helpers
 * read the cookie or clear it; setting only happens in middleware (per-visit)
 * or in a Route Handler / Server Action when the user explicitly resets.
 */

export const CONVERSATION_COOKIE_NAME = "workfully_conversation_id";
export const CONVERSATION_COOKIE_MAX_AGE_S = 60 * 60 * 24 * 7;

export async function getConversationCookie(): Promise<string | null> {
  const store = await cookies();
  return store.get(CONVERSATION_COOKIE_NAME)?.value ?? null;
}

export async function clearConversationCookie(): Promise<void> {
  const store = await cookies();
  store.delete(CONVERSATION_COOKIE_NAME);
}
