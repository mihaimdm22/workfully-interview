import { readAllStats } from "@/lib/walkthrough/stats";

/**
 * Build-time stats strip. Renders 5 numbers read from the filesystem and the
 * committed coverage snapshot. Anti-SaaS-grid styling: horizontal strip with
 * mono numerics, no card backgrounds, no icons in colored circles.
 */
export async function StatsBanner() {
  const stats = await readAllStats();
  const allNull = Object.values(stats).every((v) => v === null);

  const items: { label: string; value: number | null; suffix?: string }[] = [
    { label: "Tests", value: stats.tests },
    { label: "Coverage", value: stats.coverage, suffix: "%" },
    { label: "ADRs", value: stats.adrs },
    { label: "Lines of TS", value: stats.loc },
    { label: "Runtime deps", value: stats.deps },
  ];

  return (
    <section
      aria-label="Project stats"
      className="border-border my-12 border-y py-6"
    >
      <ul className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-5">
        {items.map((item) => (
          <li key={item.label} className="flex flex-col">
            <span className="text-fg font-mono text-[36px] leading-none font-medium tabular-nums">
              {item.value === null ? "—" : item.value.toLocaleString("en-US")}
              {item.value !== null && item.suffix ? (
                <span className="text-fg-muted text-[24px]">{item.suffix}</span>
              ) : null}
            </span>
            <span className="text-fg-subtle mt-2 text-[11px] font-medium tracking-[0.06em] uppercase">
              {item.label}
            </span>
          </li>
        ))}
      </ul>
      {allNull ? (
        <p className="text-fg-subtle mt-4 text-[12px]">
          Build stats unavailable.
        </p>
      ) : null}
    </section>
  );
}
