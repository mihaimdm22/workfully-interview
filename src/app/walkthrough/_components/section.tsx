interface SectionProps {
  id: string;
  eyebrow: string;
  title: string;
  /** Lead paragraph rendered below the heading. Optional. */
  lead?: string;
  children: React.ReactNode;
}

/**
 * Shared section shell. Spacing follows DESIGN.md: 48px above heading,
 * 24px below, enforces "headings closer to their section" rule.
 */
export function Section({ id, eyebrow, title, lead, children }: SectionProps) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      className="border-border mt-12 scroll-mt-8 border-t pt-12"
    >
      <div className="text-fg-subtle mb-3 text-[11px] font-medium tracking-[0.06em] uppercase">
        {eyebrow}
      </div>
      <h2
        id={`${id}-heading`}
        className="text-[28px] leading-tight font-semibold tracking-tight"
      >
        {title}
      </h2>
      {lead ? (
        <p className="text-fg-muted mt-4 max-w-[64ch] text-[16px] leading-relaxed">
          {lead}
        </p>
      ) : null}
      <div className="mt-6">{children}</div>
    </section>
  );
}
