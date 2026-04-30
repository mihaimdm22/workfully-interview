import Link from "next/link";
import { startNewScreening } from "@/app/actions";
import { Pill } from "@/components/ui/pill";
import { ScoreDisplay } from "@/components/ui/score-display";
import type { Verdict } from "@/lib/domain/verdict-style";

export interface ScreeningCardData {
  id: string;
  candidateName: string;
  role: string;
  verdict: Verdict;
  score: number;
  summary: string;
  createdAt: Date;
}

export function ScreeningCard({ screening }: { screening: ScreeningCardData }) {
  return (
    <Link
      href={`/screening/${screening.id}`}
      className="border-border bg-bg-elevated hover:border-border-strong flex flex-col gap-3 rounded-xl border p-5 transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[15px] font-semibold tracking-tight">
            {screening.candidateName}
          </div>
          <div className="text-fg-muted mt-0.5 text-[13px]">
            {screening.role}
          </div>
        </div>
        <Pill verdict={screening.verdict} />
      </div>

      <p className="text-fg-muted line-clamp-2 text-[13px] leading-relaxed">
        {screening.summary}
      </p>

      <div className="border-border mt-auto flex items-end justify-between border-t pt-3">
        <ScoreDisplay
          value={screening.score}
          verdict={screening.verdict}
          size="md"
        />
        <div className="text-fg-subtle text-right text-[12px]">
          <div>{relativeTime(screening.createdAt)}</div>
          <div className="text-fg-muted mt-1">Open →</div>
        </div>
      </div>
    </Link>
  );
}

export function NewScreeningCard() {
  return (
    <form action={startNewScreening} className="contents">
      <button
        type="submit"
        className="border-border text-fg-muted hover:border-accent hover:text-accent flex min-h-[200px] flex-col items-center justify-center gap-1 rounded-xl border border-dashed p-5 transition-colors"
      >
        <span className="text-[22px]" aria-hidden>
          +
        </span>
        <div className="text-[14px] font-medium">New screening</div>
        <div className="text-fg-subtle text-[12px]">⌘N</div>
      </button>
    </form>
  );
}

function relativeTime(d: Date): string {
  const now = Date.now();
  const then = d.getTime();
  const diffMs = now - then;
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "Yesterday";
  if (day < 7) return `${day} days ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
