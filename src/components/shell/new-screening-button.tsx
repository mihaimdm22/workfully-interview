"use client";

import { useFormStatus } from "react-dom";
import { startNewScreening } from "@/app/actions";

/**
 * Sidebar primary CTA. Lives as a client component because two interactions
 * have to run before the form action fires:
 *
 *   1. Mid-evaluation guard. `<ChatStream>` writes `data-streaming="true"`
 *      onto `<body>` while an SSE evaluation is in flight. If the user clicks
 *      "+ New screening" mid-stream we'd silently abort the in-flight AI call
 *      and lose the verdict-in-progress. So we read the body attribute and
 *      pop a confirmation; only proceed if the user accepts.
 *
 *   2. Pending guard. The action does a delete + dispatch + redirect chain;
 *      a double-click would race two CAS writes (the action retries CME but
 *      the second click is just wasted work). `useFormStatus().pending`
 *      disables the button during submit so a fast double-click collapses to
 *      one server round-trip.
 *
 * The form action itself stays a server action — the client wrapper only
 * intercepts the click.
 */
export function NewScreeningButton() {
  return (
    <form action={startNewScreening} onSubmit={onSubmitGuard}>
      <SubmitButton />
    </form>
  );
}

function onSubmitGuard(e: React.FormEvent<HTMLFormElement>) {
  if (typeof document === "undefined") return;
  if (document.body.dataset.streaming !== "true") return;
  const ok = window.confirm(
    "A screening is in progress. Cancel it and start over?",
  );
  if (!ok) {
    e.preventDefault();
  }
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-primary text-primary-fg flex w-full items-center justify-center gap-2 rounded-xl px-3.5 py-2.5 text-[14px] font-medium transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
    >
      + New screening
      <span className="ml-2 rounded border border-white/15 bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-white/75 dark:border-black/15 dark:bg-black/10 dark:text-black/75">
        {pending ? "…" : "⌘N"}
      </span>
    </button>
  );
}
