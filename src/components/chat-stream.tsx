"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageBubble } from "@/components/message-bubble";
import { ScreeningResultCard } from "@/components/screening-result-card";
import { StreamingVerdict } from "@/components/streaming-verdict";
import type { Message } from "@/lib/db/schema";
import type { ScreeningResult } from "@/lib/domain/screening";

/**
 * Chat client that owns the active screening conversation. Renders the
 * server-supplied initial transcript, then takes over for new submits via
 * the SSE endpoint. Partials from the AI stream render as `<StreamingVerdict>`
 * in real time; on `done` with a `redirectTo`, the client navigates to the
 * permanent verdict URL.
 *
 * Server still owns the source of truth (the FSM snapshot in Postgres). This
 * component is a presentation layer over it — refresh at any point and the
 * server-rendered transcript fills back in.
 */

interface OptimisticUserMessage {
  id: string;
  role: "user";
  content: string;
  attachmentName: string | null;
  attachmentBytes: number | null;
}

interface OptimisticBotMessage {
  id: string;
  role: "bot";
  content: string;
  attachmentName: null;
  attachmentBytes: null;
  result: ScreeningResult | null;
}

type OptimisticMessage = OptimisticUserMessage | OptimisticBotMessage;

interface ChatStreamProps {
  initialMessages: Pick<
    Message,
    "id" | "role" | "content" | "attachmentName" | "attachmentBytes"
  >[];
  initialResultByMessageId: Record<string, ScreeningResult>;
}

interface StreamEvent {
  type: "user-message" | "partial" | "done" | "error";
  state?: unknown;
  redirectTo?: string;
  reply?: string;
  partial?: Partial<ScreeningResult>;
  error?: string;
  userMessage?: string;
  attachmentName?: string;
  attachmentBytes?: number;
}

export function ChatStream({
  initialMessages,
  initialResultByMessageId,
}: ChatStreamProps) {
  const [optimistic, setOptimistic] = useState<OptimisticMessage[]>([]);
  const [partial, setPartial] = useState<Partial<ScreeningResult> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();

  // Publish streaming state on `<body data-streaming>` so client trees outside
  // this subtree (the sidebar's "+ New screening" button) can decide whether
  // to confirm before reset. Cheaper than wiring a React context that would
  // force the workspace layout to become a client component. See eng review
  // issue #4 in `.context/plans/screening-history-plan.md`.
  useEffect(() => {
    const body = document.body;
    if (pending) {
      body.dataset.streaming = "true";
    } else {
      delete body.dataset.streaming;
    }
    return () => {
      delete body.dataset.streaming;
    };
  }, [pending]);

  function tempId(): string {
    return `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  async function consumeStream(formData: FormData) {
    setError(null);
    setPartial(null);
    const res = await fetch("/api/screening/stream", {
      method: "POST",
      body: formData,
    });
    if (!res.ok || !res.body) {
      setError(`Server returned ${res.status}`);
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let redirectTo: string | undefined;
    let botReply: string | undefined;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // SSE frames are separated by \n\n
      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        if (!frame.startsWith("data: ")) continue;
        const payload = frame.slice(6).trim();
        if (payload === "[DONE]") continue;
        let parsed: StreamEvent;
        try {
          parsed = JSON.parse(payload) as StreamEvent;
        } catch {
          continue;
        }
        switch (parsed.type) {
          case "user-message":
            setOptimistic((prev) => [
              ...prev,
              {
                id: tempId(),
                role: "user",
                content: parsed.userMessage ?? "",
                attachmentName: parsed.attachmentName ?? null,
                attachmentBytes: parsed.attachmentBytes ?? null,
              },
            ]);
            break;
          case "partial":
            if (parsed.partial) setPartial(parsed.partial);
            break;
          case "done":
            redirectTo = parsed.redirectTo;
            botReply = parsed.reply;
            break;
          case "error":
            // Clear stale streaming UI on error. Specifically: if a RESET
            // from another tab won the CAS race against an in-flight
            // evaluation, the SSE route emits this error event AFTER having
            // already streamed `partial` events. Without these resets the
            // user sees a half-rendered StreamingVerdict next to a red
            // banner — broken-state-machine UI. router.refresh() pulls a
            // fresh transcript so the chat reconciles to actual server
            // state. See eng review issue #5.
            setError(parsed.error ?? "Failed");
            setPartial(null);
            setOptimistic([]);
            router.refresh();
            break;
        }
      }
    }

    if (redirectTo) {
      // Verdict produced — navigate to the permanent URL. The detail page
      // will render the full verdict server-side.
      router.push(redirectTo);
      router.refresh();
      return;
    }

    // No redirect — gathering or cancel/reset path. Append the bot reply
    // optimistically and refresh server data so the next submit sees the
    // current FSM state.
    if (botReply) {
      setOptimistic((prev) => [
        ...prev,
        {
          id: tempId(),
          role: "bot",
          content: botReply!,
          attachmentName: null,
          attachmentBytes: null,
          result: null,
        },
      ]);
    }
    setPartial(null);
    router.refresh();
    formRef.current?.reset();
  }

  function submitText(formData: FormData) {
    formData.set("kind", "text");
    startTransition(async () => {
      await consumeStream(formData);
    });
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.set("kind", "pdf");
    fd.set("file", file);
    startTransition(async () => {
      await consumeStream(fd);
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      formRef.current?.requestSubmit();
    }
  }

  const isDisabled = pending;

  // Combine server transcript + optimistic adds. Optimistic messages live
  // until `router.refresh()` rehydrates the server messages; we filter out
  // any optimistic message whose content already appears in the server set.
  const seenContent = new Set(
    initialMessages.map((m) => `${m.role}:${m.content}`),
  );
  const visibleOptimistic = optimistic.filter(
    (m) => !seenContent.has(`${m.role}:${m.content}`),
  );

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col">
      <section
        className="flex-1 space-y-3 overflow-y-auto px-4 py-6"
        aria-live="polite"
        aria-label="Chat transcript"
      >
        {initialMessages.length === 0 && visibleOptimistic.length === 0 ? (
          <p className="text-fg-muted text-[13px]">Loading…</p>
        ) : (
          <>
            {initialMessages.map((m) => {
              const result = initialResultByMessageId[m.id];
              return (
                <MessageBubble key={m.id} message={m as Message}>
                  {result && (
                    <div className="mt-3">
                      <ScreeningResultCard result={result} />
                    </div>
                  )}
                </MessageBubble>
              );
            })}
            {visibleOptimistic.map((m) => (
              <MessageBubble key={m.id} message={m as unknown as Message} />
            ))}
          </>
        )}
        {partial && (
          <div className="mt-2">
            <StreamingVerdict partial={partial} />
          </div>
        )}
      </section>

      <div className="border-border bg-bg relative border-t">
        {pending && (
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 h-px overflow-hidden"
          >
            <div className="shimmer-bar h-full" />
          </div>
        )}
        <form
          ref={formRef}
          action={submitText}
          className="mx-auto flex w-full max-w-3xl items-end gap-2 px-4 py-3"
        >
          <label
            className="border-border bg-muted text-fg-muted flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-xl border transition disabled:cursor-not-allowed disabled:opacity-50"
            title="Upload a PDF (JD or CV)"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              onChange={onFileChange}
              disabled={isDisabled}
              aria-label="Upload PDF"
            />
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
          </label>
          <textarea
            ref={textRef}
            name="message"
            rows={1}
            placeholder="Type a message, paste a JD/CV, or use /screen, /newjob, /cancel…"
            className="border-border focus:ring-accent/40 max-h-48 min-h-10 flex-1 resize-y rounded-xl border bg-transparent px-3 py-2 text-sm focus:ring-2 focus:outline-none"
            disabled={isDisabled}
            onKeyDown={onKeyDown}
            autoFocus
          />
          <button
            type="submit"
            disabled={isDisabled}
            className="bg-primary text-primary-fg inline-flex h-10 shrink-0 items-center justify-center rounded-xl px-4 text-sm font-medium transition hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Evaluating…" : "Send"}
          </button>
        </form>
        {error && (
          <div
            role="alert"
            className="border-danger/30 bg-danger/10 text-danger mx-auto -mt-2 mb-3 max-w-3xl rounded-md border px-3 py-1.5 text-xs"
          >
            {error}
          </div>
        )}
      </div>
    </main>
  );
}
