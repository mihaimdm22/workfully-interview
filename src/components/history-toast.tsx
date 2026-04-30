"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const SEEN_KEY = "workfully_history_toast_seen";
const AUTO_DISMISS_MS = 4_000;

/**
 * One-shot discoverability toast for the new "+ New screening" behavior.
 *
 * The "+ New screening" server action redirects to `/screening/new?reset=1`.
 * This component reads that flag, and if a localStorage marker hasn't been
 * set yet, shows a small "Previous verdict saved in the sidebar" toast for
 * 4 seconds (or until the user dismisses with ×). Then it sets the marker
 * and strips the query param via `router.replace` so reloads stay clean.
 *
 * Renders nothing on subsequent resets, on direct loads of /screening/new,
 * or after the marker is set. Mounted from `<WorkspaceLayout>` so it covers
 * every workspace route, not just the chat page.
 *
 * Auto-decision T2 from /autoplan: 4s auto-dismiss + manual × button.
 */
export function HistoryToast() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reset = searchParams.get("reset");

  // Derive initial `show` synchronously from query + storage during the first
  // render so we don't trigger a setState inside the post-mount effect (which
  // React 19's `react-hooks/set-state-in-effect` rule forbids — it cascades
  // renders). The initializer runs once; subsequent prop changes don't
  // re-trigger it, which is exactly the one-shot behavior we want.
  const [show, setShow] = useState(() => {
    if (typeof window === "undefined") return false; // SSR
    if (reset !== "1") return false;
    try {
      return window.localStorage.getItem(SEEN_KEY) !== "1";
    } catch {
      // Private mode / disabled storage — show once anyway.
      return true;
    }
  });

  useEffect(() => {
    if (reset !== "1") return;
    if (typeof window === "undefined") return;

    // Persist the seen marker and strip `?reset=1` regardless of whether
    // the toast is showing — keeps reloads clean and prevents a second
    // toast on subsequent navigation.
    try {
      window.localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // ignore
    }
    const params = new URLSearchParams(searchParams.toString());
    params.delete("reset");
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });

    if (!show) return;
    const t = setTimeout(() => setShow(false), AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [reset, router, searchParams, show]);

  if (!show) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="border-border bg-bg-elevated text-fg shadow-pop motion-safe:animate-fade-in fixed right-4 bottom-4 z-50 flex max-w-sm items-start gap-3 rounded-xl border px-4 py-3 text-[13px]"
    >
      <div className="flex-1">
        <div className="font-medium">Started a new screening</div>
        <div className="text-fg-muted mt-0.5 text-[12px]">
          Your previous verdict is saved in the sidebar. Click any row to
          revisit.
        </div>
      </div>
      <button
        type="button"
        onClick={() => setShow(false)}
        aria-label="Dismiss"
        className="text-fg-subtle hover:text-fg shrink-0 rounded-md px-1.5 py-0.5 text-[14px] transition-colors"
      >
        ×
      </button>
    </div>
  );
}
