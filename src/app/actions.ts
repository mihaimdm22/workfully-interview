"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  dispatch,
  loadConversation,
  startConversation,
} from "@/lib/fsm/orchestrator";
import { classifyIntent } from "@/lib/domain/intent";
import { extractPdfText } from "@/lib/ai/extract-pdf";
import { clearConversationCookie, getConversationCookie } from "@/lib/cookies";
import type { BotEvent } from "@/lib/fsm/machine";

const MAX_TEXT_LENGTH = 30_000;
const MAX_PDF_BYTES = 5 * 1024 * 1024; // 5MB

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Ensure a conversation row exists for the cookie set by the proxy.
 *
 * Next 16 forbids cookie writes from Server Component renders, so cookie
 * minting lives in `src/proxy.ts` (formerly `middleware.ts`). By the time any
 * page or action runs, the cookie is guaranteed to exist. This function uses
 * that cookie's id as the authoritative conversation id and lazily inserts
 * the DB row on first use.
 */
export async function ensureConversation(): Promise<string> {
  const cookieId = await getConversationCookie();
  if (!cookieId) {
    throw new Error(
      "Conversation cookie missing — middleware did not run for this request.",
    );
  }
  const existing = await loadConversation(cookieId);
  if (existing) return cookieId;
  await startConversation(cookieId);
  return cookieId;
}

export async function resetConversation(): Promise<void> {
  await clearConversationCookie();
  redirect("/");
}

export async function sendTextMessage(
  formData: FormData,
): Promise<ActionResult> {
  const conversationId = await ensureConversation();
  const raw = String(formData.get("message") ?? "").trim();
  if (!raw) return { ok: false, error: "Empty message" };
  if (raw.length > MAX_TEXT_LENGTH) {
    return {
      ok: false,
      error: `Message too long (${raw.length}/${MAX_TEXT_LENGTH} chars)`,
    };
  }
  return processInput({ conversationId, userMessage: raw, content: raw });
}

export async function sendPdfMessage(
  formData: FormData,
): Promise<ActionResult> {
  const conversationId = await ensureConversation();
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "No file provided" };
  if (file.size === 0) return { ok: false, error: "File is empty" };
  if (file.size > MAX_PDF_BYTES) {
    return {
      ok: false,
      error: `File too large (${(file.size / 1_048_576).toFixed(1)} MB, limit 5 MB)`,
    };
  }
  if (
    !file.name.toLowerCase().endsWith(".pdf") &&
    file.type !== "application/pdf"
  ) {
    return {
      ok: false,
      error: "Only PDF uploads are supported. Paste text otherwise.",
    };
  }

  let text: string;
  try {
    const buffer = await file.arrayBuffer();
    text = await extractPdfText(buffer);
  } catch (err) {
    return {
      ok: false,
      error: `Couldn't read that PDF: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (!text.trim()) {
    return {
      ok: false,
      error:
        "PDF appears empty or scanned (no text). Paste the content instead.",
    };
  }

  return processInput({
    conversationId,
    userMessage: `📎 ${file.name}`,
    content: text,
    attachment: { name: file.name, bytes: file.size },
    docHint: inferDocType(file.name),
  });
}

/**
 * Filename-based JD-vs-CV heuristic. Demo PDFs follow common naming:
 * `cv-strong-match.pdf`, `resume_jane.pdf`, `senior-engineer-jd.pdf`,
 * `job-description.pdf`. Returns `undefined` when ambiguous so the FSM's
 * setMissing action can fill whichever slot is empty.
 */
function inferDocType(filename: string): "jd" | "cv" | undefined {
  const lower = filename.toLowerCase();
  if (/(^|[^a-z])(cv|resume|résumé|curriculum.?vitae)([^a-z]|$)/.test(lower)) {
    return "cv";
  }
  if (
    /(^|[^a-z])(jd|job.?description|job.?posting|posting|role)([^a-z]|$)/.test(
      lower,
    )
  ) {
    return "jd";
  }
  return undefined;
}

async function processInput(opts: {
  conversationId: string;
  userMessage: string;
  content: string;
  attachment?: { name: string; bytes: number };
  docHint?: "jd" | "cv";
}): Promise<ActionResult> {
  const intent = classifyIntent(opts.content);

  let event: BotEvent;
  switch (intent.kind) {
    case "startScreening":
      event = { type: "START_SCREENING" };
      break;
    case "startJobBuilder":
      event = { type: "START_JOB_BUILDER" };
      break;
    case "cancel":
      event = { type: "CANCEL" };
      break;
    case "reset":
      event = { type: "RESET" };
      break;
    case "content":
      if (opts.docHint === "cv") {
        event = { type: "PROVIDE_CV", text: intent.text };
      } else if (opts.docHint === "jd") {
        event = { type: "PROVIDE_JD", text: intent.text };
      } else {
        event = { type: "PROVIDE_TEXT", text: intent.text };
      }
      break;
  }

  try {
    await dispatch({
      conversationId: opts.conversationId,
      event,
      userMessage: opts.userMessage,
      attachment: opts.attachment,
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  revalidatePath("/");
  return { ok: true };
}
