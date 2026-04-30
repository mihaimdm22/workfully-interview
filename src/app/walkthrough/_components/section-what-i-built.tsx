import Link from "next/link";
import { Section } from "./section";

export function WhatIBuilt({ id }: { id: string }) {
  return (
    <Section
      id={id}
      eyebrow="Overview"
      title="What I built."
      lead="A conversational candidate-screening bot driven by an XState finite state machine. The brief asked for three states (IDLE, SCREENING, JOB_BUILDER) with universal /cancel. I shipped the optional FSM proposal."
    >
      <ul className="text-fg my-6 grid gap-3 text-[15px] leading-relaxed">
        <li className="flex gap-3">
          <span aria-hidden className="text-fg-subtle">
            01
          </span>
          <span>
            Idle → screening → job-builder, with <code>/cancel</code> wired once
            on the <code>screening</code> parent so any sub-state cancels the
            same way.
          </span>
        </li>
        <li className="flex gap-3">
          <span aria-hidden className="text-fg-subtle">
            02
          </span>
          <span>
            The screening AI call is an <code>fromPromise</code> XState actor
            invoked from <code>evaluating</code>. The machine declares{" "}
            <em>what</em>; the orchestrator provides <em>how</em>.
          </span>
        </li>
        <li className="flex gap-3">
          <span aria-hidden className="text-fg-subtle">
            03
          </span>
          <span>
            Verdicts get a permanent page at{" "}
            <Link
              href="/"
              className="text-accent underline-offset-4 hover:underline"
            >
              the dashboard
            </Link>{" "}
            under <code>/screening/[id]</code>, an unguessable public share at{" "}
            <code>/s/[slug]</code>, an OG card, and a server-rendered Chromium
            PDF.
          </span>
        </li>
      </ul>

      <p className="text-fg-muted mt-6 max-w-[64ch] text-[15px] leading-relaxed">
        The constraint I held myself to: the FSM is the source of truth. Server
        actions don&apos;t mutate state directly. The UI doesn&apos;t mutate
        state. The AI call doesn&apos;t mutate state. Everything goes through
        the machine. That is what makes <code>/cancel</code> work the same way
        from any sub-state and what makes a page reload put you back exactly
        where you were.
      </p>
    </Section>
  );
}
