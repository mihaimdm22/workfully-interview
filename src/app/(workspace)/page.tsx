import Link from "next/link";
import { ensureConversation } from "@/app/actions";
import { listRecentScreenings } from "@/lib/db/repositories";
import { Topbar } from "@/components/shell/topbar";
import {
  ScreeningCard,
  NewScreeningCard,
  type ScreeningCardData,
} from "@/components/screening-card";
import type { Verdict } from "@/lib/domain/verdict-style";

export const dynamic = "force-dynamic";

type FilterKey = "all" | Verdict;

const TABS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "strong", label: "Strong" },
  { key: "moderate", label: "Moderate" },
  { key: "weak", label: "Weak" },
  { key: "wrong_role", label: "Wrong role" },
];

const VALID_FILTERS = new Set<FilterKey>([
  "all",
  "strong",
  "moderate",
  "weak",
  "wrong_role",
]);

function parseFilter(raw: string | string[] | undefined): FilterKey {
  if (typeof raw !== "string") return "all";
  return VALID_FILTERS.has(raw as FilterKey) ? (raw as FilterKey) : "all";
}

const FILTER_LABEL: Record<FilterKey, string> = {
  all: "All",
  strong: "Strong",
  moderate: "Moderate",
  weak: "Weak",
  wrong_role: "Wrong role",
};

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string | string[] }>;
}) {
  const conversationId = await ensureConversation();
  const recent = await listRecentScreenings(conversationId, 50);
  const filter = parseFilter((await searchParams).filter);

  const allCards: ScreeningCardData[] = recent.map((s) => ({
    id: s.id,
    candidateName: s.result.candidateName,
    role: s.result.role,
    verdict: s.result.verdict,
    score: s.result.score,
    summary: s.result.summary,
    createdAt: s.createdAt,
  }));

  const counts = {
    all: allCards.length,
    strong: allCards.filter((c) => c.verdict === "strong").length,
    moderate: allCards.filter((c) => c.verdict === "moderate").length,
    weak: allCards.filter((c) => c.verdict === "weak").length,
    wrong_role: allCards.filter((c) => c.verdict === "wrong_role").length,
  } satisfies Record<FilterKey, number>;

  const cards =
    filter === "all" ? allCards : allCards.filter((c) => c.verdict === filter);

  return (
    <>
      <Topbar
        crumbs={[{ label: "Screenings" }, { label: FILTER_LABEL[filter] }]}
        trailing={<NewScreeningButton />}
      />
      <main className="mx-auto w-full max-w-6xl px-8 pt-8 pb-16">
        <header className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight">
              Screenings
            </h1>
            <p className="text-fg-muted mt-1 text-[14px]">
              {allCards.length === 0
                ? "Paste a job description and a CV to produce your first verdict."
                : `${counts.all} candidate${counts.all === 1 ? "" : "s"} evaluated. Open one to revisit the verdict or share it.`}
            </p>
          </div>
        </header>

        {allCards.length > 0 && (
          <nav
            className="border-border mb-6 flex gap-1 border-b"
            aria-label="Filter screenings"
          >
            {TABS.map((tab) => (
              <Tab
                key={tab.key}
                href={tab.key === "all" ? "/" : `/?filter=${tab.key}`}
                label={tab.label}
                count={counts[tab.key]}
                active={tab.key === filter}
              />
            ))}
          </nav>
        )}

        {allCards.length === 0 ? (
          <EmptyDashboard />
        ) : cards.length === 0 ? (
          <NoMatchesForFilter filter={filter} />
        ) : (
          <Grid cards={cards} />
        )}
      </main>
    </>
  );
}

function NewScreeningButton() {
  return (
    <Link
      href="/screening/new"
      className="bg-primary text-primary-fg inline-flex h-8 items-center gap-2 rounded-md px-3 text-[14px] font-medium whitespace-nowrap transition-opacity hover:opacity-90"
    >
      + New screening
    </Link>
  );
}

function Tab({
  href,
  label,
  count,
  active,
}: {
  href: string;
  label: string;
  count: number;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      data-active={active ? "" : undefined}
      className="text-fg-muted data-[active]:border-fg data-[active]:text-fg -mb-px inline-flex items-center gap-2 border-b-2 border-transparent px-3 py-2.5 text-[14px] transition-colors data-[active]:font-medium"
    >
      {label}
      <span className="bg-muted text-fg-subtle rounded px-1.5 py-0.5 font-mono text-[11px]">
        {count}
      </span>
    </Link>
  );
}

function Grid({ cards }: { cards: ScreeningCardData[] }) {
  return (
    <section
      aria-label="Recent screenings"
      className="grid [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))] gap-4"
    >
      {cards.map((c) => (
        <ScreeningCard key={c.id} screening={c} />
      ))}
      <NewScreeningCard />
    </section>
  );
}

function NoMatchesForFilter({ filter }: { filter: FilterKey }) {
  return (
    <div className="border-border bg-bg-elevated mx-auto mt-8 max-w-md rounded-xl border p-6 text-center">
      <p className="text-fg-muted text-[14px]">
        No screenings match{" "}
        <span className="text-fg">{FILTER_LABEL[filter].toLowerCase()}</span>{" "}
        yet.
      </p>
      <Link
        href="/"
        className="text-fg-muted mt-3 inline-flex text-[13px] underline-offset-2 hover:underline"
      >
        Clear filter
      </Link>
    </div>
  );
}

function EmptyDashboard() {
  return (
    <div className="border-border bg-bg-elevated mx-auto mt-12 max-w-xl rounded-xl border p-8 text-center">
      <h2 className="text-[18px] font-semibold tracking-tight">
        Your first screening
      </h2>
      <p className="text-fg-muted mx-auto mt-2 max-w-md text-[14px] leading-relaxed">
        Workfully evaluates a candidate against a job description and produces a
        structured, shareable verdict in about ten seconds.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <Link
          href="/screening/new"
          className="bg-primary text-primary-fg inline-flex h-9 items-center gap-2 rounded-md px-4 text-[14px] font-medium transition-opacity hover:opacity-90"
        >
          + New screening
        </Link>
      </div>
      <p className="text-fg-subtle mt-6 text-[12px]">
        Try the sample fixtures:{" "}
        <code className="font-mono">job-description.pdf</code> +{" "}
        <code className="font-mono">cv-strong-match.pdf</code>
      </p>
    </div>
  );
}
