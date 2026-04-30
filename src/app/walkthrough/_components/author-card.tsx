interface AuthorCardProps {
  variant: "hero" | "footer";
  personalSite: string;
}

const PERSONAL_SITE_LABEL = "basetool.ai/en/about/david";

export function AuthorCard({ variant, personalSite }: AuthorCardProps) {
  if (variant === "hero") {
    return (
      <div className="border-border bg-bg-elevated mt-8 flex items-center gap-3 rounded-xl border p-3">
        <Avatar />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="text-[14px] font-medium">David Marin</div>
          <div className="text-fg-muted text-[12px]">
            Built this for the Workfully interview
          </div>
        </div>
        <a
          href={personalSite}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="David Marin's personal site (opens in new tab)"
          className="text-fg-muted hover:text-fg hidden items-center gap-1 text-[12px] sm:inline-flex"
        >
          <span className="font-mono">{PERSONAL_SITE_LABEL}</span>
          <ExternalIcon />
        </a>
      </div>
    );
  }

  return null;
}

export function AuthorFooter({ id }: { id: string }) {
  return (
    <section
      id={id}
      aria-labelledby="author-heading"
      className="border-border mt-24 border-t pt-12"
    >
      <div className="text-fg-subtle mb-3 text-[11px] font-medium tracking-[0.06em] uppercase">
        About
      </div>
      <h2
        id="author-heading"
        className="text-[28px] leading-tight font-semibold tracking-tight"
      >
        Built by David Marin.
      </h2>
      <div className="mt-6 grid gap-8 md:grid-cols-[auto_1fr] md:gap-10">
        <Avatar large />
        <div className="max-w-[60ch]">
          <p className="text-fg text-[15px] leading-relaxed">
            I make AI tools for builders. Right now, I&apos;m at Pump, where we
            help startups optimize cloud spend. Before that I built Basetool, an
            open-source no-code platform that put me on the YC W22 batch.
          </p>
          <p className="text-fg-muted mt-3 text-[15px] leading-relaxed">
            I built this project the way I work in production: tests first, ADRs
            for every architectural decision, and an LLM as a paired engineer
            rather than a copy machine. The discipline is the point.
          </p>

          <ul className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-[14px]">
            <li>
              <a
                href="https://basetool.ai/en/about/david"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Personal site (opens in new tab)"
                className="text-accent inline-flex items-center gap-1 underline-offset-4 hover:underline"
              >
                <span className="font-mono">basetool.ai/en/about/david</span>
                <ExternalIcon />
              </a>
            </li>
            <li>
              <a
                href="https://github.com/mihaimdm22"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="GitHub profile (opens in new tab)"
                className="text-fg-muted hover:text-fg inline-flex items-center gap-1 transition-colors"
              >
                <span className="font-mono">github.com/mihaimdm22</span>
                <ExternalIcon />
              </a>
            </li>
            <li>
              <a
                href="mailto:partnerships@pump.vc"
                className="text-fg-muted hover:text-fg transition-colors"
              >
                <span className="font-mono">partnerships@pump.vc</span>
              </a>
            </li>
          </ul>

          <p className="text-fg-subtle mt-10 text-[12px]">
            Workfully Screening Bot v0.2.0 ·{" "}
            <a
              href="https://github.com/mihaimdm22/workfully-interview"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-fg-muted transition-colors"
            >
              source on GitHub
            </a>{" "}
            · MIT
          </p>
        </div>
      </div>
    </section>
  );
}

function Avatar({ large }: { large?: boolean }) {
  const size = large ? "size-16 text-[20px]" : "size-10 text-[12px]";
  return (
    <div
      aria-hidden
      className={`${size} flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-zinc-300 to-zinc-500 font-semibold text-white`}
    >
      DM
    </div>
  );
}

function ExternalIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M7 17L17 7" />
      <path d="M8 7h9v9" />
    </svg>
  );
}
