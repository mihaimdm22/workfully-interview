import { z } from "zod";

const fitVerdictSchema = z.enum(["strong", "moderate", "weak", "wrong_role"]);

const requirementMatchSchema = z.object({
  requirement: z
    .string()
    .describe(
      "The requirement from the job description, verbatim or paraphrased.",
    ),
  matched: z
    .boolean()
    .describe("Whether the candidate clearly meets this requirement."),
  evidence: z
    .string()
    .optional()
    .describe(
      "A short quote or paraphrase from the CV that supports the match decision.",
    ),
});

// Constraints (range, length, item counts) live in `.describe()` text and the
// system prompt rather than as JSON-Schema keywords. Anthropic and OpenAI/Azure
// structured outputs in strict mode reject `minimum`/`maximum`, `minLength`/
// `maxLength`, and `minItems`/`maxItems`, so keeping them here would break
// OpenRouter's promise of provider portability (ADR 0004). Shape + types are
// still enforced.
//
// Note: `score` is `z.number()`, not `z.number().int()`. Zod 4's
// `z.toJSONSchema()` silently injects `minimum: -2^53+1` and `maximum: 2^53-1`
// for integer types as safe-int bounds — Anthropic's structured output rejects
// the request with "For 'integer' type, properties maximum, minimum are not
// supported" the moment those land in the schema. Integer-ness is enforced via
// the prompt rubric and a defensive `Math.round()` in `screen.ts` after the
// AI call returns.
export const screeningResultSchema = z.object({
  candidateName: z
    .string()
    .describe(
      "Full name of the candidate as it appears on the CV. Use 'Unknown candidate' if the CV has no clear name.",
    ),
  role: z
    .string()
    .describe(
      "Job title from the JD, normalized to title case (e.g., 'Senior Backend Engineer'). Use 'Unspecified role' if the JD has no clear title.",
    ),
  verdict: fitVerdictSchema.describe(
    'Overall categorization of fit. Use "wrong_role" only when the CV is for a different profession entirely.',
  ),
  score: z
    .number()
    .describe(
      "Confidence score, whole number from 0 (no fit) to 100 (perfect fit). Output an integer with no decimals.",
    ),
  summary: z
    .string()
    .describe(
      "Two-sentence summary of the candidate against the role (max ~400 chars).",
    ),
  mustHaves: z
    .array(requirementMatchSchema)
    .describe(
      "Each must-have requirement from the JD with match status. At least one entry.",
    ),
  niceToHaves: z
    .array(requirementMatchSchema)
    .describe(
      "Each nice-to-have from the JD with match status. Empty array if none stated.",
    ),
  strengths: z
    .array(z.string())
    .describe("Up to five concrete strengths the candidate brings."),
  gaps: z
    .array(z.string())
    .describe("Up to five concrete gaps relative to the role."),
  recommendation: z
    .string()
    .describe(
      "One-sentence hiring recommendation a recruiter could paste into Slack (max ~300 chars).",
    ),
});

export type ScreeningResult = z.infer<typeof screeningResultSchema>;
