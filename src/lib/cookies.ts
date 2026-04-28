import "server-only";
import { cookies } from "next/headers";

const COOKIE_NAME = "workfully_conversation_id";
const ONE_WEEK_S = 60 * 60 * 24 * 7;

export async function getConversationCookie(): Promise<string | null> {
  const store = await cookies();
  return store.get(COOKIE_NAME)?.value ?? null;
}

export async function setConversationCookie(id: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: ONE_WEEK_S,
  });
}

export async function clearConversationCookie(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}
