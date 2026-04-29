import { notFound } from "next/navigation";
import { ensureConversation } from "@/app/actions";
import {
  getScreeningById,
  getShareLinkForScreening,
} from "@/lib/db/repositories";
import { Topbar } from "@/components/shell/topbar";
import { VerdictHeader } from "@/components/verdict-header";
import { RequirementList } from "@/components/requirement-list";
import { BulletBlock } from "@/components/bullet-block";
import { Recommendation } from "@/components/recommendation";
import { ShareRow } from "@/components/share-row";

export const dynamic = "force-dynamic";

export default async function ScreeningDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const conversationId = await ensureConversation();
  const screening = await getScreeningById(id, conversationId);
  if (!screening) notFound();

  const existingLink = await getShareLinkForScreening(screening.id);

  return (
    <>
      <Topbar
        crumbs={[
          { label: "Screenings", href: "/" },
          {
            label: `${screening.result.candidateName} · ${screening.result.role}`,
          },
        ]}
      />
      <main className="mx-auto w-full max-w-[920px] px-8 pt-8 pb-16">
        <VerdictHeader
          result={screening.result}
          meta={{
            model: screening.model,
            latencyMs: screening.latencyMs,
            createdAt: screening.createdAt,
          }}
        />

        <RequirementList
          title="Must-haves"
          items={screening.result.mustHaves}
        />
        <RequirementList
          title="Nice-to-haves"
          items={screening.result.niceToHaves}
        />

        <section className="mb-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
          <BulletBlock
            title="Strengths"
            tone="success"
            bullets={screening.result.strengths}
          />
          <BulletBlock
            title="Gaps"
            tone="danger"
            bullets={screening.result.gaps}
          />
        </section>

        <Recommendation text={screening.result.recommendation} />

        <ShareRow
          screeningId={screening.id}
          candidateName={screening.result.candidateName}
          initialSlug={existingLink?.slug}
        />
      </main>
    </>
  );
}
