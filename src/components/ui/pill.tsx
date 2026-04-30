import { styleFor, type Verdict } from "@/lib/domain/verdict-style";

interface PillProps {
  verdict: Verdict;
  /** Override the auto-generated label, e.g. "Strong match · 5 / 5 must-haves". */
  label?: string;
  /** Smaller pill variant for sidebar rows and cards. Default is medium. */
  size?: "sm" | "md";
}

const VERDICT_PILL_CLASSES: Record<Verdict, string> = {
  strong: "bg-success-bg text-success ring-success-ring",
  moderate: "bg-accent-bg text-accent ring-accent-ring",
  weak: "bg-warning-bg text-warning ring-warning-ring",
  wrong_role: "bg-danger-bg text-danger ring-danger-ring",
};

export function Pill({ verdict, label, size = "md" }: PillProps) {
  const s = styleFor(verdict);
  const padding =
    size === "sm" ? "px-2.5 py-0.5 text-[11px]" : "px-3 py-1 text-xs";
  return (
    <span
      data-verdict={verdict}
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ring-1 ring-inset ${VERDICT_PILL_CLASSES[verdict]} ${padding}`}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {label ?? s.label}
    </span>
  );
}

const VERDICT_DOT_CLASSES: Record<Verdict, string> = {
  strong: "bg-success",
  moderate: "bg-accent",
  weak: "bg-warning",
  wrong_role: "bg-danger",
};

/** Tiny dot-only variant used in dense sidebar rows. */
export function VerdictDot({ verdict }: { verdict: Verdict }) {
  const s = styleFor(verdict);
  return (
    <span
      aria-label={s.label}
      className={`inline-block size-1.5 rounded-full ${VERDICT_DOT_CLASSES[verdict]}`}
    />
  );
}
