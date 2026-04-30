import { ensureConversation } from "@/app/actions";
import { listRecentScreenings } from "@/lib/db/repositories";
import { Sidebar, type SidebarRow } from "@/components/shell/sidebar";
import { CmdKPalette, type SearchItem } from "@/components/cmd-k-palette";

export const dynamic = "force-dynamic";

/**
 * Workspace shell — sidebar only. Each page renders its own <Topbar> so the
 * breadcrumbs and trailing actions can be page-specific (App Router doesn't
 * re-render layouts on child route changes).
 *
 * Public routes like /s/[slug] live OUTSIDE this group so they don't inherit
 * the sidebar — see plan-eng-review decision 1C.
 */
export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const conversationId = await ensureConversation();
  const recent = await listRecentScreenings(conversationId, 12);

  const sidebarRows: SidebarRow[] = recent.map((s) => ({
    id: s.id,
    candidateName: s.result.candidateName,
    role: s.result.role,
    verdict: s.result.verdict,
    score: s.result.score,
  }));

  const searchItems: SearchItem[] = recent.map((s) => ({
    id: s.id,
    candidateName: s.result.candidateName,
    role: s.result.role,
    summary: s.result.summary,
    verdict: s.result.verdict,
    score: s.result.score,
  }));

  return (
    <div className="grid min-h-dvh [grid-template-columns:auto_1fr]">
      <Sidebar rows={sidebarRows} />
      <div className="flex min-w-0 flex-col">{children}</div>
      <CmdKPalette items={searchItems} />
    </div>
  );
}
