import { Section } from "./section";
import { CodeBlock } from "./code-block";

const ROUTING_SNIPPET = `const DEFAULT_MODEL = "anthropic/claude-sonnet-4.6";
const modelId = process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL;
const model = openrouter(modelId);`;

export function AiSection({ id }: { id: string }) {
  return (
    <Section
      id={id}
      eyebrow="AI integration"
      title="Provider-agnostic by default."
      lead="One env var swaps the model. The schema, the prompt, and the FSM don't move when the provider changes. This is the abstraction I'd advocate for at Workfully too."
    >
      <CodeBlock
        code={ROUTING_SNIPPET}
        lang="ts"
        label="src/lib/ai/screen.ts"
      />

      <ul className="text-fg my-6 grid gap-3 text-[15px] leading-relaxed">
        <li className="flex gap-3">
          <span aria-hidden className="text-accent">
            ✓
          </span>
          <span>
            Same code talks to Anthropic, OpenAI, Google, Mistral, anyone
            OpenRouter routes to.
          </span>
        </li>
        <li className="flex gap-3">
          <span aria-hidden className="text-accent">
            ✓
          </span>
          <span>A/B different models with one env var, zero code edits.</span>
        </li>
        <li className="flex gap-3">
          <span aria-hidden className="text-accent">
            ✓
          </span>
          <span>Single key to rotate. Single billing surface.</span>
        </li>
      </ul>

      <p className="text-fg-muted mt-6 max-w-[64ch] text-[15px] leading-relaxed">
        The model market keeps shifting. When Workfully wants to evaluate
        GPT-5.4 or Gemini 3 against the same screening prompt, it&apos;s a
        five-minute change instead of a sprint. See{" "}
        <a
          className="text-accent underline-offset-4 hover:underline"
          href="https://github.com/mihaimdm22/workfully-interview/blob/main/docs/adr/0004-ai-and-structured-output.md"
          target="_blank"
          rel="noopener noreferrer"
        >
          ADR 0004
        </a>{" "}
        for the full rationale.
      </p>
    </Section>
  );
}
