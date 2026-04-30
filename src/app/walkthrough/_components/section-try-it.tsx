import Link from "next/link";
import { Section } from "./section";

interface TryItSectionProps {
  id: string;
  children: React.ReactNode;
}

export function TryItSection({ id, children }: TryItSectionProps) {
  return (
    <Section
      id={id}
      eyebrow="Try it"
      title="Real verdicts from this app."
      lead="The cards below render via the same React components the running app uses. Click through to start a real screening of your own — drag in any JD + CV PDF and the bot evaluates them in about ten seconds."
    >
      <div className="my-6 flex flex-wrap gap-3">
        <Link
          href="/screening/new"
          className="bg-primary text-primary-fg inline-flex h-10 items-center gap-2 rounded-md px-4 text-[14px] font-medium transition-opacity hover:opacity-90"
        >
          + Start a new screening
        </Link>
        <Link
          href="/"
          className="border-border text-fg hover:bg-muted inline-flex h-10 items-center gap-2 rounded-md border px-4 text-[14px] transition-colors"
        >
          See the dashboard
        </Link>
      </div>

      {children}
    </Section>
  );
}
