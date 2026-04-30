import type { Metadata } from "next";
import { Hero } from "./_components/hero";
import { StatsBanner } from "./_components/stats-banner";
import { StateMachine } from "./_components/state-machine";
import { VerdictGallery } from "./_components/verdict-gallery";
import { AuthorFooter } from "./_components/author-card";
import { StickyToc } from "./_components/sticky-toc";
import { WhatIBuilt } from "./_components/section-what-i-built";
import { SchemaSection } from "./_components/section-schema";
import { AiSection } from "./_components/section-ai";
import { TestingSection } from "./_components/section-testing";
import { ToolingSection } from "./_components/section-tooling";
import { WorkflowSection } from "./_components/section-workflow";
import { TryItSection } from "./_components/section-try-it";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Workfully Screening Bot — architecture walkthrough",
  description:
    "How I built a finite-state-machine conversational candidate screening bot. Architecture, decisions, testing, AI in the workflow.",
  robots: { index: false, follow: false },
  openGraph: {
    title: "Workfully Screening Bot — architecture walkthrough",
    description:
      "How I built a finite-state-machine conversational candidate screening bot.",
    type: "article",
  },
};

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "state-machine", label: "State machine" },
  { id: "schema", label: "Schema as contract" },
  { id: "ai", label: "AI integration" },
  { id: "testing", label: "Testing" },
  { id: "tooling", label: "Tooling" },
  { id: "workflow", label: "AI in my workflow" },
  { id: "try-it", label: "Try it" },
  { id: "author", label: "About" },
] as const;

export default function WalkthroughPage() {
  return (
    <div className="relative">
      <a
        href="#overview"
        className="bg-bg text-fg focus-visible:ring-accent sr-only z-50 rounded-md px-3 py-2 text-[13px] focus-visible:not-sr-only focus-visible:fixed focus-visible:top-3 focus-visible:left-3 focus-visible:ring-2"
      >
        Skip to content
      </a>

      <div className="mx-auto grid w-full max-w-[1200px] gap-12 px-6 pt-12 pb-16 lg:grid-cols-[minmax(0,1fr)_220px] lg:px-10 lg:pt-16">
        <main className="min-w-0">
          <Hero />
          <StatsBanner />
          <WhatIBuilt id="overview" />
          <StateMachine id="state-machine" />
          <SchemaSection id="schema" />
          <AiSection id="ai" />
          <TestingSection id="testing" />
          <ToolingSection id="tooling" />
          <WorkflowSection id="workflow" />
          <TryItSection id="try-it">
            <VerdictGallery />
          </TryItSection>
          <AuthorFooter id="author" />
        </main>

        <StickyToc sections={SECTIONS} />
      </div>
    </div>
  );
}
