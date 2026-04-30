"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { createShareLink } from "@/app/actions";

/**
 * SSR-safe `window.location.origin`. Returns "" during server render and the
 * first client render (so hydration matches), then the real origin on every
 * render after mount. Using `useSyncExternalStore` rather than `useEffect +
 * setState` keeps this lint-clean and avoids a cascading second render.
 */
function useOrigin(): string {
  return useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );
}

interface ShareRowProps {
  screeningId: string;
  candidateName: string;
  /**
   * If a slug already exists for this screening, the parent passes it.
   * Otherwise the Generate button creates one on first click.
   */
  initialSlug?: string;
}

export function ShareRow({
  screeningId,
  candidateName,
  initialSlug,
}: ShareRowProps) {
  const [slug, setSlug] = useState<string | undefined>(initialSlug);
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);

  // Renders "" on the server, "" on the first client render (so hydration
  // matches), then `https://host` on every render after mount. This avoids
  // the SSR/client divergence the previous `typeof window` branch caused.
  const origin = useOrigin();
  const url = slug ? `${origin}/s/${slug}` : "";

  function generate() {
    startTransition(async () => {
      const res = await createShareLink(screeningId);
      if (res.ok) setSlug(res.slug);
    });
  }

  function copy() {
    if (!url) return;
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <section className="mb-8">
      <div className="text-fg-subtle mb-3 text-[11px] font-medium tracking-[0.06em] uppercase">
        Share this verdict
      </div>

      {!slug ? (
        <button
          type="button"
          onClick={generate}
          disabled={pending}
          className="bg-primary text-primary-fg inline-flex h-9 items-center gap-2 rounded-md px-4 text-[14px] font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <ShareIcon />
          {pending ? "Generating…" : "Generate share link"}
        </button>
      ) : (
        <>
          <div className="border-border bg-bg-elevated grid grid-cols-[1fr_auto] items-center gap-2 rounded-lg border p-1 pl-3">
            <div className="text-fg-muted truncate font-mono text-[13px]">
              {url}
            </div>
            <button
              type="button"
              onClick={copy}
              className="border-border bg-bg text-fg hover:bg-muted inline-flex h-8 items-center rounded-md border px-3 text-[14px] transition-colors"
            >
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="border-border bg-bg text-fg hover:bg-muted inline-flex h-8 items-center gap-2 rounded-md border px-3 text-[14px] transition-colors"
            >
              Open share page ↗
            </a>
            <a
              href={`mailto:?subject=${encodeURIComponent(`Screening verdict: ${candidateName}`)}&body=${encodeURIComponent(url)}`}
              className="border-border bg-bg text-fg hover:bg-muted inline-flex h-8 items-center gap-2 rounded-md border px-3 text-[14px] transition-colors"
            >
              Email
            </a>
            <a
              href={`/s/${slug}/pdf/download`}
              className="border-border bg-bg text-fg hover:bg-muted inline-flex h-8 items-center gap-2 rounded-md border px-3 text-[14px] transition-colors"
              download
            >
              Download PDF
            </a>
          </div>
        </>
      )}
    </section>
  );
}

function ShareIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}
