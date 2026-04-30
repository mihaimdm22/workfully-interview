import { WALKTHROUGH_VERDICTS } from "@/lib/walkthrough/verdict-fixtures";
import { VerdictHeader } from "@/components/verdict-header";
import { RequirementList } from "@/components/requirement-list";
import { Recommendation } from "@/components/recommendation";

/**
 * Inline verdict gallery — reuses the same components that render real
 * verdicts at /screening/[id] and /s/[slug]. Hardcoded fixtures (no DB dep)
 * so the page is renderable on any deploy.
 *
 * Anti-slop framing: section heading is "Real verdicts from this app", not
 * "What our users say" — they are real outputs of the running system, not
 * testimonials.
 */
export function VerdictGallery() {
  return (
    <div className="mt-8 flex flex-col gap-10">
      <p className="text-fg-muted max-w-[64ch] text-[15px] leading-relaxed">
        These render via the same React components the running app uses for{" "}
        <code>/screening/[id]</code> and <code>/s/[slug]</code>. The data is a
        hardcoded sample so the gallery has zero database dependencies — every
        prop here matches the Zod schema the LLM is constrained to produce.
      </p>

      {WALKTHROUGH_VERDICTS.map((result, i) => (
        <article
          key={`${result.candidateName}-${i}`}
          className="border-border bg-bg-elevated rounded-2xl border p-6 sm:p-8"
        >
          <VerdictHeader result={result} />
          <RequirementList title="Must-haves" items={result.mustHaves} />
          {result.niceToHaves.length > 0 ? (
            <RequirementList title="Nice-to-haves" items={result.niceToHaves} />
          ) : null}
          <Recommendation text={result.recommendation} readOnly />
        </article>
      ))}
    </div>
  );
}
