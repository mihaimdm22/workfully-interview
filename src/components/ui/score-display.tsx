import type { Verdict } from "@/lib/domain/verdict-style";

interface ScoreDisplayProps {
  value: number;
  verdict?: Verdict;
  size?: "sm" | "md" | "lg" | "hero";
  /** Show "/100" denominator. Default true; sidebar rows pass false. */
  showDenominator?: boolean;
}

const SIZE_CLASSES: Record<NonNullable<ScoreDisplayProps["size"]>, string> = {
  sm: "text-[13px]",
  md: "text-[28px] leading-none",
  lg: "text-[36px] leading-none -tracking-[0.02em]",
  hero: "text-[160px] leading-none -tracking-[0.04em]",
};

const DENOM_SIZE_CLASSES: Record<
  NonNullable<ScoreDisplayProps["size"]>,
  string
> = {
  sm: "text-[11px]",
  md: "text-[14px]",
  lg: "text-[18px]",
  hero: "text-[22px]",
};

const VERDICT_COLOR_CLASSES: Record<Verdict, string> = {
  strong: "text-success",
  moderate: "text-accent",
  weak: "text-warning",
  wrong_role: "text-danger",
};

export function ScoreDisplay({
  value,
  verdict,
  size = "md",
  showDenominator = true,
}: ScoreDisplayProps) {
  const colorClass = verdict ? VERDICT_COLOR_CLASSES[verdict] : "text-fg";
  return (
    <span
      className={`font-mono font-semibold tabular-nums ${SIZE_CLASSES[size]} ${colorClass}`}
    >
      {value}
      {showDenominator && (
        <span
          className={`text-fg-subtle font-normal ${DENOM_SIZE_CLASSES[size]}`}
        >
          /100
        </span>
      )}
    </span>
  );
}
