import { NextResponse, type NextRequest } from "next/server";
import { nanoid } from "nanoid";
import {
  CONVERSATION_COOKIE_MAX_AGE_S,
  CONVERSATION_COOKIE_NAME,
} from "@/lib/cookies";

/**
 * Mint a conversation cookie on first visit.
 *
 * Why proxy/middleware: Next 16 forbids cookie writes from Server Component
 * renders. Server Actions and Route Handlers can write cookies, but the chat
 * page is a regular RSC and we don't want to require a click to start. The
 * proxy runs before the page renders, so it can both inject the cookie into
 * the inbound request (so the page sees it on the same render) and set it on
 * the response (so the browser stores it for next time).
 *
 * The DB row is created lazily by the page's first call to `ensureConversation`.
 *
 * Next 16 renamed the `middleware.ts` convention to `proxy.ts`. The exported
 * function name can stay `proxy` or `middleware` — both work.
 */
export function proxy(request: NextRequest) {
  if (request.cookies.has(CONVERSATION_COOKIE_NAME)) {
    return NextResponse.next();
  }

  const id = nanoid(24);

  // Make the new cookie visible to the upstream request — the page render reads
  // it via `next/headers` cookies() and sees this fresh value, not undefined.
  request.cookies.set(CONVERSATION_COOKIE_NAME, id);

  const response = NextResponse.next({
    request: { headers: request.headers },
  });
  response.cookies.set(CONVERSATION_COOKIE_NAME, id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: CONVERSATION_COOKIE_MAX_AGE_S,
    // Only over HTTPS in production. Dev still works on plain http://localhost.
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}

export const config = {
  // Skip Next internals, static assets, and anything with a dot (favicon etc.)
  matcher: "/((?!_next/|api/|.*\\.).*)",
};
