import type { BotSnapshot } from "@/lib/fsm/snapshot";

const LABELS: Record<
  string,
  { top: string; sub?: string; tone: "idle" | "screening" | "job" }
> = {
  idle: { top: "IDLE", tone: "idle" },
  jobBuilder: { top: "JOB_BUILDER", sub: "mocked", tone: "job" },
  "screening.awaitingJobDescription": {
    top: "SCREENING",
    sub: "awaiting JD",
    tone: "screening",
  },
  "screening.awaitingCv": {
    top: "SCREENING",
    sub: "awaiting CV",
    tone: "screening",
  },
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

function describe(value: BotSnapshot["value"]): {
  top: string;
  sub?: string;
  tone: "idle" | "screening" | "job";
} {
  if (typeof value === "string")
    return LABELS[value] ?? { top: String(value).toUpperCase(), tone: "idle" };
  if ("screening" in value) {
    const key = `screening.${value.screening}`;
    return (
      LABELS[key] ?? {
        top: "SCREENING",
        sub: String(value.screening),
        tone: "screening",
      }
    );
  }
  return { top: "IDLE", tone: "idle" };
}

export function StatePill({ value }: { value: BotSnapshot["value"] }) {
  const { top, sub, tone } = describe(value);
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
