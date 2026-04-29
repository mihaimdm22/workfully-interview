import type { SnapshotFrom } from "xstate";
import type { botMachine } from "./machine";

type Snapshot = SnapshotFrom<typeof botMachine>;
type StateValue = Snapshot["value"];

/**
 * Bot's user-facing prompt for a given state.
 *
 * Kept here (not in components) so:
 *   1. The same string is used by E2E tests, server logs, and UI.
 *   2. Localization later means changing one file.
 *   3. The mapping state → prompt is exhaustive and type-checked.
 */
export function promptForState(value: StateValue): string {
  if (value === "idle") {
    return "Hi! I'm here to help. You can `/screen` a candidate against a job, or `/newjob` to draft a new role.";
  }

  if (value === "jobBuilder") {
    return "Job builder is mocked for this challenge. In the real flow, I'd guide you through title, responsibilities, requirements, and compensation. Type `/cancel` to head back.";
  }

  if (typeof value === "object" && "screening" in value) {
    switch (value.screening) {
      case "awaitingJobDescription":
        return "Select, paste, or upload the **job description**. (Type `/cancel` to abort.)";
      case "awaitingCv":
        return "Got it. Now paste or upload the candidate's **CV**.";
      case "evaluating":
        return "Reading the JD and CV. This usually takes 5–15 seconds…";
      case "presentingResult":
        return "Here's the screening verdict. Type `/screen` to evaluate another candidate, `/newjob` to draft a job, or `/reset` to head back to idle.";
    }
  }

  return "Something unexpected. Type `/cancel` to reset.";
}
