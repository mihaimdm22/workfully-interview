import { Pill } from "@/components/ui/pill";
import { ScoreDisplay } from "@/components/ui/score-display";
import type { ScreeningResult } from "@/lib/domain/screening";
import { styleFor, type Verdict } from "@/lib/domain/verdict-style";

interface VerdictHeaderProps {
  result: ScreeningResult;
  /** Set true while the AI is still streaming so the score animates in. */
  streaming?: boolean;
  /** When provided, displayed as `claude-sonnet-4.6 · 8.4s` under the role. */
  meta?: { model: string; latencyMs: number; createdAt: Date };
}

const VERDICT_BORDER_CLASSES: Record<Verdict, string> = {
  strong: "border-l-success",
  moderate: "border-l-accent",
  weak: "border-l-warning",
  wrong_role: "border-l-danger",
};

export function VerdictHeader({ result, streaming, meta }: VerdictHeaderProps) {
  const s = styleFor(result.verdict);
  const matched = result.mustHaves.filter((m) => m.matched).length;
  const total = result.mustHaves.length;

  return (
    <div
      data-testid="verdict-header"
      className={streaming ? undefined : "animate-scale-in"}
    >
      <div className="mb-6 grid grid-cols-[1fr_auto] items-start gap-6">
        <div>
          <div className="mb-3">
            <Pill
              verdict={result.verdict}
              label={`${s.label}${total > 0 ? ` · ${matched} / ${total} must-haves` : ""}`}
            />
          </div>
          <h1 className="text-[22px] leading-tight font-semibold tracking-tight">
            {result.candidateName}
          </h1>
          <div className="text-fg-muted mt-1 text-[14px]">{result.role}</div>
        </div>
        <div className="text-right">
          <div className="text-fg-subtle text-[11px] font-medium tracking-[0.06em] uppercase">
            Fit score
          </div>
          <div className="mt-1">
            <ScoreDisplay
              value={result.score}
              verdict={result.verdict}
              size="lg"
            />
          </div>
        </div>
      </div>

      {meta && (
        <div className="text-fg-muted mb-6 flex flex-wrap gap-x-3 gap-y-1 text-[13px]">
          <span>Evaluated {relativeTime(meta.createdAt)}</span>
          <span className="text-fg-subtle">·</span>
          <span className="font-mono">{meta.model}</span>
          <span className="text-fg-subtle">·</span>
          <span>Generated in {(meta.latencyMs / 1000).toFixed(1)}s</span>
        </div>
      )}

      <p
        className={`mb-8 border-l-2 pl-4 text-[15px] leading-relaxed ${VERDICT_BORDER_CLASSES[result.verdict]}`}
      >
        {result.summary}
      </p>
    </div>
  );
}

function relativeTime(d: Date): string {
  const now = Date.now();
  const diffMs = now - d.getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `${sec} seconds ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} day${day === 1 ? "" : "s"} ago`;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
