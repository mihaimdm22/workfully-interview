import type { BotSnapshot } from "./snapshot";

type StateValue = BotSnapshot["value"];
type Context = BotSnapshot["context"];

/**
 * Bot's user-facing prompt for a given state + context.
 *
 * Kept here (not in components) so:
 *   1. The same string is used by E2E tests, server logs, and UI.
 *   2. Localization later means changing one file.
 *   3. The mapping (state, context) → prompt is exhaustive and type-checked.
 *
 * The signature accepts an optional `context` because `gathering` renders
 * different copy depending on which document the bot already has.
 */
export function promptForState(value: StateValue, context?: Context): string {
  if (value === "idle") {
    return "Hi! I'm here to help. You can `/screen` a candidate against a job, or `/newjob` to draft a new role. You can also just paste or upload a JD or CV to get started.";
  }

  if (value === "jobBuilder") {
    return "Job builder is mocked for this challenge. In the real flow, I'd guide you through title, responsibilities, requirements, and compensation. Type `/cancel` to head back.";
  }

  if (typeof value === "object" && "screening" in value) {
    switch (value.screening) {
      case "gathering": {
        const hasJd = !!context?.jobDescription?.trim();
        const hasCv = !!context?.cv?.trim();
        if (hasJd && !hasCv) {
          return "Got the **job description**. Now paste or upload the candidate's **CV**. (Type `/cancel` to abort.)";
        }
        if (hasCv && !hasJd) {
          return "Got the **CV**. Now paste or upload the **job description**. (Type `/cancel` to abort.)";
        }
        return "Paste or upload the **job description** or **CV** in any order — I'll evaluate as soon as I have both. (Type `/cancel` to abort.)";
      }
      case "evaluating":
        return "Reading the JD and CV. This usually takes 5–15 seconds…";
      case "presentingResult":
        return "Here's the screening verdict. Type `/screen` to evaluate another candidate, `/newjob` to draft a job, or `/reset` to head back to idle.";
    }
  }

  return "Something unexpected. Type `/cancel` to reset.";
}

/** Convenience helper that pulls value + context off a snapshot. */
export function promptForSnapshot(snap: BotSnapshot): string {
  return promptForState(snap.value, snap.context);
}
