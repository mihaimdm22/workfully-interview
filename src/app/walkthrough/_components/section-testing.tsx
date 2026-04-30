import { Section } from "./section";
import { CodeBlock } from "./code-block";

const FAKE_AI_SNIPPET = `// src/lib/ai/screen.ts
if (process.env.WORKFULLY_FAKE_AI === "1" && !deps.model) {
  return fakeScreen(input);
}`;

export function TestingSection({ id }: { id: string }) {
  return (
    <Section
      id={id}
      eyebrow="Testing"
      title="Pyramid, not snowman."
      lead="Most of the value at the bottom: pure unit tests across the FSM, the intent classifier, the schema, the snapshot rehydration. Boundary tests above. One Playwright E2E at the top, deterministic via WORKFULLY_FAKE_AI=1."
    >
      <ul className="text-fg my-6 grid gap-3 text-[15px] leading-relaxed">
        <li className="flex gap-3">
          <span aria-hidden className="text-fg-subtle">
            01
          </span>
          <span>
            Test <em>my</em> FSM, not XState&apos;s framework.
          </span>
        </li>
        <li className="flex gap-3">
          <span aria-hidden className="text-fg-subtle">
            02
          </span>
          <span>Test at the boundary, not the implementation.</span>
        </li>
        <li className="flex gap-3">
          <span aria-hidden className="text-fg-subtle">
            03
          </span>
          <span>
            Mock at the integration point (<code>provide({"{ actors }"})</code>
            ), not deeper in the SDK.
          </span>
        </li>
        <li className="flex gap-3">
          <span aria-hidden className="text-fg-subtle">
            04
          </span>
          <span>
            One E2E for &quot;wires connected,&quot; not for coverage.
          </span>
        </li>
        <li className="flex gap-3">
          <span aria-hidden className="text-fg-subtle">
            05
          </span>
          <span>
            Don&apos;t test the model&apos;s IQ. That is an eval problem, not a
            unit-test problem.
          </span>
        </li>
      </ul>

      <h3 className="mt-10 text-[18px] font-semibold tracking-tight">
        The escape hatch I&apos;m proudest of.
      </h3>
      <p className="text-fg-muted mt-3 max-w-[64ch] text-[15px] leading-relaxed">
        When <code>WORKFULLY_FAKE_AI=1</code> is set, <code>screen()</code>{" "}
        bypasses OpenRouter entirely and runs a 30-line deterministic stub. CI
        runs Playwright against it: the build does not depend on OpenRouter
        uptime, the assertions can be precise, and the codepath is unreachable
        in production because the env var simply is not there.
      </p>
      <CodeBlock
        code={FAKE_AI_SNIPPET}
        lang="ts"
        label="src/lib/ai/screen.ts"
      />
      <p className="text-fg-muted max-w-[64ch] text-[15px] leading-relaxed">
        See{" "}
        <a
          className="text-accent underline-offset-4 hover:underline"
          href="https://github.com/mihaimdm22/workfully-interview/blob/main/docs/adr/0005-testing-strategy.md"
          target="_blank"
          rel="noopener noreferrer"
        >
          ADR 0005
        </a>{" "}
        for the full strategy.
      </p>
    </Section>
  );
}
