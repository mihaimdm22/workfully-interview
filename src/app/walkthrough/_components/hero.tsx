import Link from "next/link";
import { AuthorCard } from "./author-card";

const PERSONAL_SITE = "https://basetool.ai/en/about/david";

export function Hero() {
  return (
    <header className="pt-4 pb-2">
      <div className="text-fg-subtle mb-6 flex items-center gap-2 text-[13px] font-medium tracking-tight">
        <span aria-hidden className="bg-accent size-2 rounded-[2px]" />
        Workfully Screening Bot
        <span aria-hidden className="text-fg-subtle">
          ·
        </span>
        <span className="font-mono text-[12px]">v0.2.0</span>
      </div>

      <h1
        className="text-fg leading-none font-semibold tracking-[-0.02em]"
        style={{ fontSize: "var(--text-page-hero)" }}
      >
        How I built a finite-state-machine screening bot.
      </h1>

      <p className="text-fg-muted mt-5 max-w-[64ch] text-[18px] leading-snug">
        A walkthrough of the architecture, the decisions, and the tools I used
        to ship the optional FSM proposal from the Workfully technical
        challenge.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3 text-[14px]">
        <Link
          href="/screening/new"
          className="text-accent inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline"
        >
          Try it now
          <span aria-hidden>→</span>
        </Link>
        <a
          href="https://github.com/mihaimdm22/workfully-interview"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="View source on GitHub (opens in new tab)"
          className="text-fg-muted hover:text-fg inline-flex items-center gap-1 transition-colors"
        >
          mihaimdm22/workfully-interview
          <ExternalIcon />
        </a>
        <a
          href="#author"
          className="text-fg-muted hover:text-fg inline-flex items-center gap-1 transition-colors"
        >
          About the author
        </a>
      </div>

      <AuthorCard variant="hero" personalSite={PERSONAL_SITE} />
    </header>
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
