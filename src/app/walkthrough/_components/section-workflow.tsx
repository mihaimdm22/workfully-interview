import { Section } from "./section";

export function WorkflowSection({ id }: { id: string }) {
  return (
    <Section
      id={id}
      eyebrow="How I built it"
      title="Claude Code as a paired engineer."
      lead="It's a fair question — this is a lot of code and a lot of polish for one challenge. Let me be honest about how I built it."
    >
      <div className="text-fg my-6 flex flex-col gap-5 text-[15px] leading-relaxed">
        <p>
          <strong className="text-fg">ADRs first.</strong> Every major decision
          has a one-page ADR in <code>docs/adr/</code>. I wrote them with the
          model and iterated. They are real engineering decisions with real
          tradeoffs, not summaries.
        </p>
        <p>
          <strong className="text-fg">Tests force the design.</strong> The state
          machine has full transition coverage because the test suite told me
          when a proposed transition was wrong. The model proposed; the tests
          said yes or no.
        </p>
        <p>
          <strong className="text-fg">Schema is the contract.</strong> I wrote
          the Zod schema by hand. The model implemented against it.{" "}
          <code>generateObject</code> enforces the same contract at runtime.
          Every layer of the stack speaks the same shape.
        </p>
        <p>
          <strong className="text-fg">Reviews before commit.</strong> Every diff
          went through both a code-review agent and CodeQL. CodeQL catches what
          humans miss. The model catches what CodeQL misses. I catch what both
          miss.
        </p>
      </div>

      <div className="border-l-accent bg-accent-bg/40 my-6 border-l-2 px-5 py-4">
        <p className="text-fg max-w-[60ch] text-[15px] leading-relaxed">
          The discipline matters more than the tool. AI accelerated this work by
          maybe four-x. The architecture, the tests, and the ADRs are why
          it&apos;s shippable.
        </p>
      </div>
    </Section>
  );
}
