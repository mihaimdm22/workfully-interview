"use client";

import { Pill } from "@/components/ui/pill";
import { ScoreDisplay } from "@/components/ui/score-display";
import type { ScreeningResult } from "@/lib/domain/screening";
import { styleFor, type Verdict } from "@/lib/domain/verdict-style";

/**
 * Renders a partial ScreeningResult as it's being streamed in. Each field
 * shows up the moment it arrives, with placeholder skeleton bars for fields
 * the model hasn't committed yet.
 *
 * The shape mirrors `<VerdictHeader>` + `<RequirementList>` so that when the
 * stream completes and the page redirects to /screening/[id], the visual
 * transition is "this verdict just rendered fuller" rather than a full layout
 * shift.
 */

const VERDICT_BORDER_CLASSES: Record<Verdict, string> = {
  strong: "border-l-success",
  moderate: "border-l-accent",
  weak: "border-l-warning",
  wrong_role: "border-l-danger",
};

export function StreamingVerdict({
  partial,
}: {
  partial: Partial<ScreeningResult>;
}) {
  const verdict = partial.verdict;
  const s = verdict ? styleFor(verdict) : null;
  const matched = partial.mustHaves?.filter((m) => m.matched).length ?? 0;
  const total = partial.mustHaves?.length ?? 0;
  const summaryBorder = verdict
    ? VERDICT_BORDER_CLASSES[verdict]
    : "border-l-border";

  return (
    <div
      data-testid="streaming-verdict"
      className="border-border bg-bg-elevated rounded-2xl border p-5"
    >
      <div className="mb-5 grid grid-cols-[1fr_auto] items-start gap-6">
        <div className="flex min-w-0 flex-col gap-2.5">
          {verdict ? (
            <Pill
              verdict={verdict}
              label={`${s!.label}${total > 0 ? ` · ${matched} / ${total} must-haves` : ""}`}
            />
          ) : (
            <div className="skeleton h-5 w-32" />
          )}
          {partial.candidateName ? (
            <h2 className="animate-fade-in text-fg text-[20px] leading-tight font-semibold tracking-tight">
              {partial.candidateName}
            </h2>
          ) : (
            <div className="skeleton h-6 w-48" />
          )}
          {partial.role ? (
            <div className="animate-fade-in text-fg-muted text-[13px]">
              {partial.role}
            </div>
          ) : (
            <div className="skeleton h-4 w-36" />
          )}
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <div className="text-fg-subtle text-[11px] font-medium tracking-[0.06em] uppercase">
            Fit score
          </div>
          {partial.score != null && verdict ? (
            <span className="animate-fade-in">
              <ScoreDisplay value={partial.score} verdict={verdict} size="md" />
            </span>
          ) : (
            <div className="skeleton h-8 w-20" />
          )}
        </div>
      </div>

      {/* Summary */}
      {partial.summary ? (
        <p
          className={`animate-fade-in mb-5 border-l-2 pl-4 text-[14px] leading-relaxed ${summaryBorder}`}
        >
          {partial.summary}
        </p>
      ) : (
        <div className="mb-5 flex flex-col gap-2 pl-4">
          <div className="skeleton h-4 w-full" />
          <div className="skeleton h-4 w-11/12" />
        </div>
      )}

      {/* Must-haves */}
      <div className="mb-5">
        <div className="text-fg-subtle mb-2 flex items-center justify-between text-[11px] font-medium tracking-[0.06em] uppercase">
          <span>Must-haves</span>
          {total > 0 && (
            <span className="font-mono">
              {matched} / {total}
            </span>
          )}
        </div>
        {partial.mustHaves && partial.mustHaves.length > 0 ? (
          <ul className="flex flex-col">
            {partial.mustHaves.map((item, i) => {
              const isLast = i === partial.mustHaves!.length - 1;
              return (
                <li
                  key={i}
                  className={`animate-fade-in grid grid-cols-[20px_1fr] items-start gap-3 py-2 ${
                    isLast ? "" : "border-border border-b"
                  }`}
                >
                  <span
                    aria-label={item.matched ? "matched" : "not matched"}
                    className={`mt-0.5 inline-flex size-[18px] items-center justify-center rounded-full text-[10px] font-bold ${
                      item.matched
                        ? "bg-success-bg text-success"
                        : "bg-danger-bg text-danger"
                    }`}
                  >
                    {item.matched ? "✓" : "✕"}
                  </span>
                  <div className="text-[13px]">{item.requirement}</div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-[20px_1fr] gap-3">
              <div className="skeleton size-4 rounded-full" />
              <div className="skeleton h-4 w-3/4" />
            </div>
            <div className="grid grid-cols-[20px_1fr] gap-3">
              <div className="skeleton size-4 rounded-full" />
              <div className="skeleton h-4 w-2/3" />
            </div>
          </div>
        )}
      </div>

      {/* Recommendation */}
      {partial.recommendation && (
        <div className="animate-fade-in border-border bg-muted mt-3 mb-2 rounded-lg border p-4">
          <div className="text-fg-subtle text-[11px] font-medium tracking-[0.06em] uppercase">
            Recommendation
          </div>
          <p className="mt-1.5 text-[13px] leading-relaxed">
            {partial.recommendation}
          </p>
        </div>
      )}

      {/* Live ticker */}
      <div className="text-fg-muted mt-3 flex items-center gap-2 text-[11px]">
        <span
          aria-hidden
          className="animate-pulse-dot bg-accent inline-block size-1.5 rounded-full"
        />
        <span>Streaming verdict from the model…</span>
      </div>
    </div>
  );
}
