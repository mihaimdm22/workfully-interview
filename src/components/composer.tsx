"use client";

import { useRef, useState, useTransition } from "react";
import { sendPdfMessage, sendTextMessage } from "@/app/actions";

export function Composer({ disabled }: { disabled?: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  function submitText(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await sendTextMessage(formData);
      if (!res.ok) setError(res.error ?? "Failed to send");
      else formRef.current?.reset();
    });
  }

  function submitPdf(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await sendPdfMessage(formData);
      if (!res.ok) setError(res.error ?? "Failed to send");
    });
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    submitPdf(fd);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      formRef.current?.requestSubmit();
    }
  }

  const isDisabled = !!disabled || pending;

  return (
    <div className="border-border bg-background border-t">
      <form
        ref={formRef}
        action={submitText}
        className="mx-auto flex w-full max-w-3xl items-end gap-2 px-4 py-3"
      >
        <label className="border-border bg-muted hover:bg-muted/80 flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-xl border transition disabled:cursor-not-allowed disabled:opacity-50">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            onChange={onFileChange}
            disabled={isDisabled}
            aria-label="Upload PDF"
          />
          <span aria-hidden className="text-lg">
            📎
          </span>
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
          required
        />
        <button
          type="submit"
          disabled={isDisabled}
          className="bg-primary text-primary-foreground inline-flex h-10 shrink-0 items-center justify-center rounded-xl px-4 text-sm font-medium transition hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "…" : "Send"}
        </button>
      </form>
      {error && (
        <div
          role="alert"
          className="text-danger border-danger/30 bg-danger/10 mx-auto -mt-2 mb-3 max-w-3xl rounded-md border px-3 py-1.5 text-xs"
        >
          {error}
        </div>
      )}
    </div>
  );
}
