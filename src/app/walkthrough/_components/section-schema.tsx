import { Section } from "./section";
import { CodeBlock } from "./code-block";

const SCHEMA_SNIPPET = `// src/lib/domain/screening.ts
export const screeningResultSchema = z.object({
  candidateName: z.string(),
  role: z.string(),
  verdict: z.enum(["strong", "moderate", "weak", "wrong_role"]),
  score: z.number().int(),
  summary: z.string(),
  mustHaves: z.array(requirementMatchSchema),
  niceToHaves: z.array(requirementMatchSchema),
  strengths: z.array(z.string()),
  gaps: z.array(z.string()),
  recommendation: z.string(),
});

export type ScreeningResult = z.infer<typeof screeningResultSchema>;`;

const AI_USAGE = `// src/lib/ai/screen.ts
const { object } = await generateObject({
  model,
  schema: screeningResultSchema,    // ← LLM constraint
  schemaName: "ScreeningResult",
  system: SYSTEM_PROMPT,
  prompt: buildPrompt(input),
  maxRetries: 2,
});`;

const DB_USAGE = `// src/lib/db/schema.ts
result: jsonb("result").$type<ScreeningResult>(),  // ← DB column type`;

export function SchemaSection({ id }: { id: string }) {
  return (
    <Section
      id={id}
      eyebrow="Discipline"
      title="One Zod schema, three uses."
      lead="The same schema in src/lib/domain/screening.ts is the contract for the LLM, the inferred TypeScript types, and the Drizzle column type. Change one file, three layers update together."
    >
      <CodeBlock
        code={SCHEMA_SNIPPET}
        lang="ts"
        label="src/lib/domain/screening.ts"
      />
      <CodeBlock code={AI_USAGE} lang="ts" label="src/lib/ai/screen.ts" />
      <CodeBlock code={DB_USAGE} lang="ts" label="src/lib/db/schema.ts" />

      <p className="text-fg-muted mt-6 max-w-[64ch] text-[15px] leading-relaxed">
        This is what keeps the LLM honest in production. The model returns a
        typed <code>ScreeningResult</code> or it throws — there is no
        parse-the-JSON-and-pray path anywhere in the codebase. If a model can
        not produce schema-valid JSON after two retries, the FSM&apos;s error
        branch fires and the user sees a friendly error.
      </p>
    </Section>
  );
}
