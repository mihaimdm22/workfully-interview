import { Section } from "./section";

/**
 * Static SVG diagram of the bot finite state machine.
 *
 * Shape mirrors `src/lib/fsm/machine.ts`. Colors are semantic per DESIGN.md:
 * - accent (blue) = active/current state types
 * - success = success transition
 * - danger = error transition
 * - fg-muted = non-decision text
 *
 * SVG inherits text color via `currentColor` so dark/light mode works for free.
 */
export function StateMachine({ id }: { id: string }) {
  return (
    <Section
      id={id}
      eyebrow="Architecture"
      title="The state machine is the source of truth."
      lead="Server actions translate user input into FSM events. Nothing else mutates conversation state. Page reload? Same place. /cancel from any sub-state? One transition on the parent."
    >
      <div className="border-border bg-bg-elevated my-6 overflow-x-auto rounded-xl border p-6 sm:p-8">
        <svg
          role="img"
          aria-labelledby="state-machine-title state-machine-desc"
          viewBox="0 0 720 460"
          className="text-fg mx-auto block h-auto w-full max-w-[680px]"
        >
          <title id="state-machine-title">
            Bot finite state machine — three top-level states with a screening
            sub-state group
          </title>
          <desc id="state-machine-desc">
            IDLE transitions to SCREENING via START_SCREENING or to JOB_BUILDER
            via START_JOB_BUILDER. SCREENING contains gathering, evaluating, and
            presentingResult. CANCEL from any sub-state returns to IDLE.
          </desc>

          <defs>
            <marker
              id="arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M0,0 L10,5 L0,10 z" fill="currentColor" opacity="0.6" />
            </marker>
            <marker
              id="arrow-success"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M0,0 L10,5 L0,10 z" fill="var(--success)" />
            </marker>
            <marker
              id="arrow-danger"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M0,0 L10,5 L0,10 z" fill="var(--danger)" />
            </marker>
          </defs>

          {/* IDLE */}
          <g>
            <rect
              x="280"
              y="20"
              width="160"
              height="56"
              rx="10"
              fill="var(--accent-bg)"
              stroke="var(--accent)"
              strokeWidth="1.5"
            />
            <text
              x="360"
              y="48"
              textAnchor="middle"
              fontSize="14"
              fontWeight="600"
              fill="currentColor"
            >
              IDLE
            </text>
            <text
              x="360"
              y="65"
              textAnchor="middle"
              fontSize="11"
              fill="var(--fg-muted)"
            >
              greets, lists commands
            </text>
          </g>

          {/* JOB_BUILDER */}
          <g>
            <rect
              x="540"
              y="120"
              width="160"
              height="56"
              rx="10"
              fill="var(--muted)"
              stroke="var(--border-strong)"
              strokeWidth="1"
            />
            <text
              x="620"
              y="148"
              textAnchor="middle"
              fontSize="14"
              fontWeight="600"
              fill="currentColor"
            >
              JOB_BUILDER
            </text>
            <text
              x="620"
              y="165"
              textAnchor="middle"
              fontSize="11"
              fill="var(--fg-muted)"
            >
              mocked
            </text>
          </g>

          {/* SCREENING container */}
          <g>
            <rect
              x="20"
              y="120"
              width="440"
              height="320"
              rx="14"
              fill="none"
              stroke="var(--border-strong)"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
            <text
              x="40"
              y="142"
              fontSize="11"
              fontWeight="600"
              fill="var(--fg-subtle)"
              letterSpacing="0.06em"
            >
              SCREENING
            </text>
          </g>

          {/* gathering */}
          <g>
            <rect
              x="60"
              y="170"
              width="180"
              height="56"
              rx="10"
              fill="var(--bg-elevated)"
              stroke="var(--border-strong)"
              strokeWidth="1"
            />
            <text
              x="150"
              y="195"
              textAnchor="middle"
              fontSize="13"
              fontWeight="600"
              fill="currentColor"
            >
              gathering
            </text>
            <text
              x="150"
              y="212"
              textAnchor="middle"
              fontSize="11"
              fill="var(--fg-muted)"
            >
              JD + CV in any order
            </text>
          </g>

          {/* evaluating */}
          <g>
            <rect
              x="60"
              y="260"
              width="180"
              height="56"
              rx="10"
              fill="var(--accent-bg)"
              stroke="var(--accent)"
              strokeWidth="1.5"
            />
            <text
              x="150"
              y="285"
              textAnchor="middle"
              fontSize="13"
              fontWeight="600"
              fill="currentColor"
            >
              evaluating
            </text>
            <text
              x="150"
              y="302"
              textAnchor="middle"
              fontSize="11"
              fill="var(--fg-muted)"
            >
              invokes screen() actor
            </text>
          </g>

          {/* presentingResult */}
          <g>
            <rect
              x="280"
              y="260"
              width="160"
              height="56"
              rx="10"
              fill="var(--success-bg)"
              stroke="var(--success)"
              strokeWidth="1.5"
            />
            <text
              x="360"
              y="285"
              textAnchor="middle"
              fontSize="13"
              fontWeight="600"
              fill="currentColor"
            >
              presentingResult
            </text>
            <text
              x="360"
              y="302"
              textAnchor="middle"
              fontSize="11"
              fill="var(--fg-muted)"
            >
              typed verdict
            </text>
          </g>

          {/* OpenRouter / Claude side */}
          <g>
            <rect
              x="540"
              y="270"
              width="160"
              height="40"
              rx="8"
              fill="var(--muted)"
              stroke="var(--border)"
              strokeWidth="1"
            />
            <text
              x="620"
              y="295"
              textAnchor="middle"
              fontSize="12"
              fontFamily="var(--font-mono)"
              fill="var(--fg-muted)"
            >
              OpenRouter → Claude
            </text>
          </g>

          {/* Arrows */}
          {/* IDLE → SCREENING (gathering) */}
          <g opacity="0.85">
            <path
              d="M 320 76 L 240 170"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              markerEnd="url(#arrow)"
            />
            <text
              x="225"
              y="118"
              fontSize="11"
              fontFamily="var(--font-mono)"
              fill="var(--fg-muted)"
            >
              /screen
            </text>
          </g>

          {/* IDLE → JOB_BUILDER */}
          <g opacity="0.85">
            <path
              d="M 440 56 L 540 130"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              markerEnd="url(#arrow)"
            />
            <text
              x="465"
              y="92"
              fontSize="11"
              fontFamily="var(--font-mono)"
              fill="var(--fg-muted)"
            >
              /newjob
            </text>
          </g>

          {/* gathering → evaluating */}
          <g>
            <path
              d="M 150 226 L 150 260"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              markerEnd="url(#arrow)"
            />
            <text x="160" y="248" fontSize="11" fill="var(--fg-muted)">
              both filled
            </text>
          </g>

          {/* evaluating → presentingResult (success) */}
          <g>
            <path
              d="M 240 288 L 280 288"
              fill="none"
              stroke="var(--success)"
              strokeWidth="1.5"
              markerEnd="url(#arrow-success)"
            />
            <text
              x="245"
              y="278"
              fontSize="11"
              fill="var(--success)"
              fontFamily="var(--font-mono)"
            >
              onDone
            </text>
          </g>

          {/* evaluating → IDLE (error / timeout) */}
          <g>
            <path
              d="M 150 260 Q 150 110 280 50"
              fill="none"
              stroke="var(--danger)"
              strokeWidth="1.5"
              strokeDasharray="4 3"
              markerEnd="url(#arrow-danger)"
            />
            <text
              x="40"
              y="170"
              fontSize="11"
              fill="var(--danger)"
              fontFamily="var(--font-mono)"
            >
              onError / 60s
            </text>
          </g>

          {/* evaluating ↔ OpenRouter */}
          <g opacity="0.7">
            <path
              d="M 240 290 L 540 290"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            <text
              x="360"
              y="335"
              fontSize="11"
              fontFamily="var(--font-mono)"
              fill="var(--fg-muted)"
              textAnchor="middle"
            >
              fromPromise + AbortSignal
            </text>
          </g>

          {/* presentingResult → IDLE (reset) */}
          <g opacity="0.85">
            <path
              d="M 360 260 L 360 76"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              markerEnd="url(#arrow)"
            />
            <text
              x="370"
              y="170"
              fontSize="11"
              fontFamily="var(--font-mono)"
              fill="var(--fg-muted)"
            >
              /reset
            </text>
          </g>

          {/* SCREENING parent CANCEL → IDLE */}
          <g opacity="0.85">
            <path
              d="M 50 130 L 280 50"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeDasharray="6 4"
              markerEnd="url(#arrow)"
            />
            <text
              x="40"
              y="100"
              fontSize="11"
              fontFamily="var(--font-mono)"
              fill="var(--fg-muted)"
            >
              /cancel (parent transition)
            </text>
          </g>
        </svg>
      </div>

      <p className="text-fg-muted mt-6 max-w-[64ch] text-[15px] leading-relaxed">
        The thing to look at is the dashed line from the SCREENING parent. That
        is one transition on the parent state, not four wired to every leaf.
        XState&apos;s hierarchical states are why <code>/cancel</code> from{" "}
        <code>gathering</code> works the same way as <code>/cancel</code> from{" "}
        <code>evaluating</code>. The other piece is{" "}
        <code>fromPromise + AbortSignal</code>: the FSM owns the 60-second
        timeout, and when it fires, it actually cancels the in-flight model
        call.{" "}
        <a
          className="text-accent underline-offset-4 hover:underline"
          href="https://github.com/mihaimdm22/workfully-interview/blob/main/docs/adr/0001-fsm-with-xstate.md"
          target="_blank"
          rel="noopener noreferrer"
        >
          ADR 0001
        </a>{" "}
        has the full reasoning.
      </p>
    </Section>
  );
}
