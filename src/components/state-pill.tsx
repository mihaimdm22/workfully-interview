import type { BotSnapshot } from "@/lib/fsm/snapshot";

type Tone = "idle" | "screening" | "job";

const STATIC_LABELS: Record<string, { top: string; sub?: string; tone: Tone }> =
  {
    idle: { top: "IDLE", tone: "idle" },
    jobBuilder: { top: "JOB_BUILDER", sub: "mocked", tone: "job" },
    "screening.evaluating": {
      top: "SCREENING",
      sub: "evaluating…",
      tone: "screening",
    },
    "screening.presentingResult": {
      top: "SCREENING",
      sub: "verdict ready",
      tone: "screening",
    },
  };

function describe(
  value: BotSnapshot["value"],
  context?: BotSnapshot["context"],
): { top: string; sub?: string; tone: Tone } {
  if (typeof value === "string") {
    return (
      STATIC_LABELS[value] ?? { top: String(value).toUpperCase(), tone: "idle" }
    );
  }
  if ("screening" in value) {
    // The dynamic sub-label for `gathering` reflects what the bot is still
    // missing — kept in sync with replies.ts so the pill and the chat agree.
    if (value.screening === "gathering") {
      const hasJd = !!context?.jobDescription?.trim();
      const hasCv = !!context?.cv?.trim();
      let sub = "awaiting JD or CV";
      if (hasJd && !hasCv) sub = "awaiting CV";
      else if (hasCv && !hasJd) sub = "awaiting JD";
      return { top: "SCREENING", sub, tone: "screening" };
    }
    const key = `screening.${value.screening}`;
    return (
      STATIC_LABELS[key] ?? {
        top: "SCREENING",
        sub: String(value.screening),
        tone: "screening",
      }
    );
  }
  return { top: "IDLE", tone: "idle" };
}

export function StatePill({
  value,
  context,
}: {
  value: BotSnapshot["value"];
  context?: BotSnapshot["context"];
}) {
  const { top, sub, tone } = describe(value, context);
  const ringColor =
    tone === "screening"
      ? "ring-accent/40 bg-accent/10 text-accent"
      : tone === "job"
        ? "ring-warning/40 bg-warning/10 text-warning"
        : "ring-border bg-muted text-muted-foreground";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-xs ring-1 ${ringColor}`}
      aria-label={`Current state: ${top}${sub ? " " + sub : ""}`}
    >
      <span className="size-1.5 rounded-full bg-current" />
      <span>{top}</span>
      {sub && <span className="opacity-70">· {sub}</span>}
    </span>
  );
}
