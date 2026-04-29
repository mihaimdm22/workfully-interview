import type { ScreeningResult } from "@/lib/domain/screening";

const VERDICT_STYLES: Record<
  ScreeningResult["verdict"],
  { label: string; classes: string }
> = {
  strong: {
    label: "Strong match",
    classes: "bg-success/10 text-success ring-success/30",
  },
  moderate: {
    label: "Moderate match",
    classes: "bg-accent/10 text-accent ring-accent/30",
  },
  weak: {
    label: "Weak match",
    classes: "bg-warning/10 text-warning ring-warning/30",
  },
  wrong_role: {
    label: "Wrong role",
    classes: "bg-danger/10 text-danger ring-danger/30",
  },
};

export function ScreeningResultCard({ result }: { result: ScreeningResult }) {
  const verdict = VERDICT_STYLES[result.verdict];
  return (
    <div
      className="border-border bg-background rounded-2xl border p-5 text-sm shadow-sm"
      data-testid="screening-result"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <span
            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${verdict.classes}`}
          >
            {verdict.label}
          </span>
          <h3 className="mt-3 text-base font-semibold">Screening verdict</h3>
        </div>
        <div className="text-right">
          <div className="text-muted-foreground text-xs tracking-wide uppercase">
            Score
          </div>
          <div className="font-mono text-2xl font-semibold tabular-nums">
            {result.score}
            <span className="text-muted-foreground text-base font-normal">
              /100
            </span>
          </div>
        </div>
      </div>

      <p className="text-foreground/90 mt-4 leading-relaxed">
        {result.summary}
      </p>

      <Section title="Must-haves" items={result.mustHaves} />
      {result.niceToHaves.length > 0 && (
        <Section title="Nice-to-haves" items={result.niceToHaves} />
      )}

      {(result.strengths.length > 0 || result.gaps.length > 0) && (
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {result.strengths.length > 0 && (
            <BulletBlock
              title="Strengths"
              tone="success"
              bullets={result.strengths}
            />
          )}
          {result.gaps.length > 0 && (
            <BulletBlock title="Gaps" tone="danger" bullets={result.gaps} />
          )}
        </div>
      )}

      <div className="border-border mt-5 border-t pt-4">
        <div className="text-muted-foreground text-xs tracking-wide uppercase">
          Recommendation
        </div>
        <p className="mt-1 leading-relaxed">{result.recommendation}</p>
      </div>
    </div>
  );
}

function Section({
  title,
  items,
}: {
  title: string;
  items: ScreeningResult["mustHaves"];
}) {
  return (
    <div className="mt-5">
      <div className="text-muted-foreground mb-2 text-xs tracking-wide uppercase">
        {title}
      </div>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li
            key={`${item.requirement}|${item.matched}`}
            className="flex items-start gap-2"
          >
            <span
              aria-hidden
              className={`mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                item.matched
                  ? "bg-success/15 text-success"
                  : "bg-danger/15 text-danger"
              }`}
            >
              {item.matched ? "✓" : "✕"}
            </span>
            <div>
              <div className="text-foreground/90">{item.requirement}</div>
              {item.evidence && (
                <div className="text-muted-foreground mt-0.5 text-xs italic">
                  {item.evidence}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BulletBlock({
  title,
  tone,
  bullets,
}: {
  title: string;
  tone: "success" | "danger";
  bullets: string[];
}) {
  return (
    <div>
      <div
        className={`text-xs font-medium tracking-wide uppercase ${
          tone === "success" ? "text-success" : "text-danger"
        }`}
      >
        {title}
      </div>
      <ul className="text-foreground/90 mt-1.5 list-disc space-y-1 pl-5">
        {bullets.map((b) => (
          <li key={`${title}|${b}`}>{b}</li>
        ))}
      </ul>
    </div>
  );
}
