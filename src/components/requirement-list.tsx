import type { ScreeningResult } from "@/lib/domain/screening";

type Item = ScreeningResult["mustHaves"][number];

export function RequirementList({
  title,
  items,
  showCounter = true,
}: {
  title: string;
  items: Item[];
  showCounter?: boolean;
}) {
  if (items.length === 0) return null;
  const matched = items.filter((i) => i.matched).length;
  return (
    <section className="mb-8">
      <div className="text-fg-subtle mb-3 flex items-center justify-between text-[11px] font-medium tracking-[0.06em] uppercase">
        <span>{title}</span>
        {showCounter && (
          <span className="font-mono">
            {matched} / {items.length}
          </span>
        )}
      </div>
      <ul className="flex flex-col">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li
              key={i}
              className={`grid grid-cols-[20px_1fr] items-start gap-3 py-2.5 ${
                isLast ? "" : "border-border border-b"
              }`}
            >
              <Check matched={item.matched} />
              <div>
                <div className="text-[14px]">{item.requirement}</div>
                {item.evidence && (
                  <div className="text-fg-muted mt-0.5 text-[13px] italic">
                    {item.evidence}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Check({ matched }: { matched: boolean }) {
  return (
    <span
      aria-label={matched ? "matched" : "not matched"}
      className={`mt-0.5 inline-flex size-[18px] items-center justify-center rounded-full text-[10px] font-bold ${
        matched ? "bg-success-bg text-success" : "bg-danger-bg text-danger"
      }`}
    >
      {matched ? "✓" : "✕"}
    </span>
  );
}
