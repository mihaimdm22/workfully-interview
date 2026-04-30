"use client";

interface RecommendationProps {
  text: string;
  /** When true, hide interactive Copy/ATS actions (used on the public share page). */
  readOnly?: boolean;
}

export function Recommendation({ text, readOnly }: RecommendationProps) {
  return (
    <div className="border-border bg-muted mb-8 rounded-xl border p-5">
      <div className="text-fg-subtle text-[11px] font-medium tracking-[0.06em] uppercase">
        Recommendation
      </div>
      <p className="mt-2 text-[14px] leading-relaxed">{text}</p>

      {!readOnly && (
        <div className="mt-4 flex flex-wrap gap-2">
          <CopyButton text={text} />
        </div>
      )}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  function copy() {
    navigator.clipboard?.writeText(text).catch(() => {
      /* clipboard may be blocked in some contexts */
    });
  }
  return (
    <button
      type="button"
      onClick={copy}
      className="border-border bg-bg text-fg hover:bg-muted-2 inline-flex h-8 items-center gap-2 rounded-md border px-3 text-[14px] transition-colors"
    >
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
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </svg>
      Copy for Slack
    </button>
  );
}
