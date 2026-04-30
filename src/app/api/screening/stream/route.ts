import { NextRequest } from "next/server";
import { ensureConversation } from "@/app/actions";
import { dispatchStreaming } from "@/lib/fsm/orchestrator";
import { classifyIntent } from "@/lib/domain/intent";
import { extractPdfText } from "@/lib/ai/extract-pdf";
import { ConcurrentModificationError } from "@/lib/db/repositories";
import type { BotEvent } from "@/lib/fsm/machine";
import type { ScreeningResult } from "@/lib/domain/screening";

export const dynamic = "force-dynamic";
// Route handlers default to Node.js (Fluid Compute) — leaving runtime unset
// keeps things on the platform-default Node.js runtime. SSE streaming works
// natively there.

const MAX_TEXT_LENGTH = 30_000;
const MAX_PDF_BYTES = 5 * 1024 * 1024;

interface StreamEvent {
  type: "user-message" | "partial" | "done" | "error";
  /** Final state after dispatch returns (only on `done`). */
  state?: unknown;
  /** Permanent screening URL when a verdict was created. */
  redirectTo?: string;
  /** Bot reply to append to the transcript. */
  reply?: string;
  /** Partial screening result — emitted during `evaluating`. */
  partial?: Partial<ScreeningResult>;
  /** Error string for the client to render. */
  error?: string;
  /** Echo of the user-message and attachment chip so the client can render it
   *  immediately without a full page reload. */
  userMessage?: string;
  attachmentName?: string;
  attachmentBytes?: number;
}

function sse(event: StreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

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

/**
 * Single SSE endpoint that the composer hits for every submit (text or PDF).
 *
 * Returns a `text/event-stream` response. Events:
 *   - `user-message`        — echoes the user's submitted message + attachment
 *   - `partial`             — partial verdict while evaluating
 *   - `done`                — final state, optional redirectTo, bot reply
 *   - `error`               — typed error string
 *
 * On `done` with `redirectTo`, the client should `router.push(redirectTo)`.
 *
 * The single endpoint pattern lets the composer use one fetch for every
 * submit — no branching on "is this PDF or text". For non-evaluating submits
 * (e.g., providing the JD when the CV isn't here yet), no `partial` events
 * fire and the stream closes immediately after `done`.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const conversationId = await ensureConversation();
  const formData = await req.formData();
  const kind = formData.get("kind");

  let userMessage: string;
  let content: string;
  let attachment: { name: string; bytes: number } | undefined;
  let docHint: "jd" | "cv" | undefined;

  if (kind === "pdf") {
    const file = formData.get("file");
    if (!(file instanceof File)) return errorResponse("No file provided");
    if (file.size === 0) return errorResponse("File is empty");
    if (file.size > MAX_PDF_BYTES) {
      return errorResponse(
        `File too large (${(file.size / 1_048_576).toFixed(1)} MB, limit 5 MB)`,
      );
    }
    if (
      !file.name.toLowerCase().endsWith(".pdf") &&
      file.type !== "application/pdf"
    ) {
      return errorResponse(
        "Only PDF uploads are supported. Paste text otherwise.",
      );
    }

    let text: string;
    try {
      const buffer = await file.arrayBuffer();
      text = await extractPdfText(buffer);
    } catch (err) {
      return errorResponse(
        `Couldn't read that PDF: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (!text.trim()) {
      return errorResponse(
        "PDF appears empty or scanned (no text). Paste the content instead.",
      );
    }

    userMessage = `Uploaded ${file.name}`;
    content = text;
    attachment = { name: file.name, bytes: file.size };
    docHint = inferDocType(file.name);
  } else {
    const raw = String(formData.get("message") ?? "").trim();
    if (!raw) return errorResponse("Empty message");
    if (raw.length > MAX_TEXT_LENGTH) {
      return errorResponse(
        `Message too long (${raw.length}/${MAX_TEXT_LENGTH} chars)`,
      );
    }
    userMessage = raw;
    content = raw;
  }

  const intent = classifyIntent(content);

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
      if (docHint === "cv") {
        event = { type: "PROVIDE_CV", text: intent.text };
      } else if (docHint === "jd") {
        event = { type: "PROVIDE_JD", text: intent.text };
      } else {
        event = { type: "PROVIDE_TEXT", text: intent.text };
      }
      break;
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (e: StreamEvent) =>
        controller.enqueue(encoder.encode(sse(e)));

      // Echo the user's message immediately so the client can render the
      // bubble before the AI call starts.
      send({
        type: "user-message",
        userMessage,
        attachmentName: attachment?.name,
        attachmentBytes: attachment?.bytes,
      });

      try {
        const result = await dispatchStreaming(
          {
            conversationId,
            event,
            userMessage,
            attachment,
          },
          (partial) => {
            send({ type: "partial", partial });
          },
        );

        send({
          type: "done",
          state: result.state,
          reply: result.reply,
          redirectTo: result.newScreeningId
            ? `/screening/${result.newScreeningId}`
            : undefined,
        });
      } catch (err) {
        if (err instanceof ConcurrentModificationError) {
          send({
            type: "error",
            error:
              "This conversation changed in another tab — refresh to continue.",
          });
        } else {
          send({
            type: "error",
            error: err instanceof Error ? err.message : String(err),
          });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

function errorResponse(error: string): Response {
  const body = sse({ type: "error", error }) + "data: [DONE]\n\n";
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
