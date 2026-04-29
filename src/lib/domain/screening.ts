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

export const screeningResultSchema = z.object({
  verdict: fitVerdictSchema.describe(
    'Overall categorization of fit. Use "wrong_role" only when the CV is for a different profession entirely.',
  ),
  score: z
    .number()
    .int()
    .min(0)
    .max(100)
    .describe("Confidence score from 0 (no fit) to 100 (perfect fit)."),
  summary: z
    .string()
    .min(1)
    .max(400)
    .describe("Two-sentence summary of the candidate against the role."),
  mustHaves: z
    .array(requirementMatchSchema)
    .min(1)
    .describe("Each must-have requirement from the JD with match status."),
  niceToHaves: z
    .array(requirementMatchSchema)
    .describe(
      "Each nice-to-have from the JD with match status. Empty array if none stated.",
    ),
  strengths: z
    .array(z.string())
    .max(5)
    .describe("Up to five concrete strengths the candidate brings."),
  gaps: z
    .array(z.string())
    .max(5)
    .describe("Up to five concrete gaps relative to the role."),
  recommendation: z
    .string()
    .min(1)
    .max(300)
    .describe(
      "One-sentence hiring recommendation a recruiter could paste into Slack.",
    ),
});

export type ScreeningResult = z.infer<typeof screeningResultSchema>;
