import Link from "next/link";
import type { Verdict } from "@/lib/domain/verdict-style";
import { VerdictDot } from "@/components/ui/pill";
import { NewScreeningButton } from "@/components/shell/new-screening-button";

export interface SidebarRow {
  id: string;
  candidateName: string;
  role: string;
  verdict: Verdict;
  score: number;
}

interface SidebarProps {
  rows: SidebarRow[];
  activeId?: string | null;
}

export function Sidebar({ rows, activeId }: SidebarProps) {
  return (
    <aside
      aria-label="Workspace navigation"
      className="w-sidebar border-border bg-bg hidden h-dvh flex-col border-r md:sticky md:top-0 md:flex"
    >
      <div className="flex items-center gap-2 px-4 py-4 text-[15px] font-bold tracking-tight">
        <span aria-hidden className="bg-accent size-2 rounded-[2px]" />
        Workfully
      </div>

      <div className="px-3 pb-3">
        <NewScreeningButton />
      </div>

      <SidebarSection title="Recent" count={rows.length} />

      <ul className="flex-1 list-none overflow-y-auto px-2 pb-2">
        {rows.length === 0 ? (
          <li className="text-fg-subtle px-3 py-2 text-[12px]">
            No screenings yet.
          </li>
        ) : (
          rows.map((row) => (
            <li key={row.id}>
              <Link
                href={`/screening/${row.id}`}
                aria-current={row.id === activeId ? "page" : undefined}
                data-active={row.id === activeId ? "" : undefined}
                className="hover:bg-muted data-[active]:bg-muted group grid grid-cols-[8px_1fr_auto_auto] items-center gap-3 rounded-md px-2.5 py-2 transition-colors"
              >
                <VerdictDot verdict={row.verdict} />
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-medium">
                    {row.candidateName}
                  </div>
                  <div className="text-fg-muted truncate text-[12px]">
                    {row.role}
                  </div>
                </div>
                <div className="text-fg-muted font-mono text-[12px] tabular-nums">
                  {row.score}
                </div>
                <span
                  aria-hidden
                  className="text-fg-subtle text-[14px] opacity-0 transition-opacity group-hover:opacity-100"
                >
                  ›
                </span>
              </Link>
            </li>
          ))
        )}
      </ul>

      <SidebarFooter />
    </aside>
  );
}

function SidebarSection({ title, count }: { title: string; count: number }) {
  return (
    <div className="text-fg-subtle flex items-center justify-between px-4 pt-4 pb-2 text-[11px] font-medium tracking-[0.06em] uppercase">
      <span>{title}</span>
      <span className="border-border bg-muted text-fg-muted rounded border px-1.5 py-0.5 font-mono text-[11px]">
        {count}
      </span>
    </div>
  );
}

function SidebarFooter() {
  return (
    <div className="border-border flex items-center gap-3 border-t p-3">
      <div
        aria-hidden
        className="flex size-7 items-center justify-center rounded-full bg-gradient-to-br from-zinc-300 to-zinc-500 text-[11px] font-semibold text-white"
      >
        DW
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="text-[13px] font-medium">Demo workspace</div>
        <div className="text-fg-muted text-[12px]">FSM · v0.1.4</div>
      </div>
      <span aria-hidden className="text-fg-subtle text-[14px]">
        ›
      </span>
    </div>
  );
}
