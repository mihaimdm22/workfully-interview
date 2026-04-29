import path from "node:path";
import { test, expect } from "@playwright/test";

/**
 * Happy-path E2E for the screening flow.
 *
 * Requires:
 *   - Postgres running:   `pnpm db:up && pnpm db:migrate`
 *   - Test-mode AI:        `WORKFULLY_FAKE_AI=1 pnpm dev`
 *
 * The fake AI returns a deterministic verdict based on simple keyword heuristics
 * so we don't depend on OpenRouter for E2E. Real screening accuracy is covered
 * by the unit tests against the schema (see src/lib/ai/screen.test.ts).
 */

const fixture = (name: string) =>
  path.resolve(__dirname, "..", "fixtures", name);

test.describe("Screening flow", () => {
  test("idle → screening → JD → CV → verdict", async ({ page }) => {
    await page.goto("/");

    // Idle greeting visible
    await expect(page.getByLabel("Chat transcript")).toContainText(
      "I'm here to help",
    );
    await expect(page.getByLabel(/Current state/)).toContainText("IDLE");

    // Start screening
    await page.getByPlaceholder(/Type a message/).fill("/screen");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByLabel(/Current state/)).toContainText("SCREENING");
    await expect(page.getByLabel("Chat transcript")).toContainText(
      /job description/i,
    );

    // Provide JD
    await page
      .getByPlaceholder(/Type a message/)
      .fill("Senior Backend Engineer with TypeScript and Node.js");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByLabel("Chat transcript")).toContainText(/CV/);

    // Provide CV
    await page
      .getByPlaceholder(/Type a message/)
      .fill("Elena Kowalski, 6 years TypeScript, NestJS, Postgres, AWS");
    await page.getByRole("button", { name: "Send" }).click();

    // Verdict appears
    const verdict = page.getByTestId("screening-result");
    await expect(verdict).toBeVisible({ timeout: 30_000 });
    await expect(verdict).toContainText(/Strong match/i);
  });

  test("upload-first: CV PDF then JD PDF auto-screens (the demo flow)", async ({
    page,
  }) => {
    await page.goto("/");

    // Idle: pill says IDLE, no /screen typed yet.
    await expect(page.getByLabel(/Current state/)).toContainText("IDLE");

    // Upload a CV-named PDF directly. Filename heuristic should route it as CV.
    await page
      .getByLabel("Upload PDF")
      .setInputFiles(fixture("cv-strong-match.pdf"));

    // Bot should now be in screening, prompting for JD (CV already in hand).
    await expect(page.getByLabel(/Current state/)).toContainText("SCREENING");
    await expect(page.getByLabel(/Current state/)).toContainText(
      /awaiting JD/i,
    );
    await expect(page.getByLabel("Chat transcript")).toContainText(
      /Got the.*CV/i,
    );

    // Now upload the JD PDF — both slots filled, FSM auto-evaluates.
    await page
      .getByLabel("Upload PDF")
      .setInputFiles(fixture("job-description.pdf"));

    const verdict = page.getByTestId("screening-result");
    await expect(verdict).toBeVisible({ timeout: 30_000 });
  });

  test("upload-first: JD PDF then CV PDF auto-screens", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByLabel(/Current state/)).toContainText("IDLE");

    // Upload the JD first — filename heuristic routes as JD.
    await page
      .getByLabel("Upload PDF")
      .setInputFiles(fixture("job-description.pdf"));
    await expect(page.getByLabel(/Current state/)).toContainText(
      /awaiting CV/i,
    );

    // Then upload the CV.
    await page
      .getByLabel("Upload PDF")
      .setInputFiles(fixture("cv-strong-match.pdf"));

    const verdict = page.getByTestId("screening-result");
    await expect(verdict).toBeVisible({ timeout: 30_000 });
  });

  test("cancel returns to idle and clears state", async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder(/Type a message/).fill("/screen");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByLabel(/Current state/)).toContainText("SCREENING");

    await page.getByPlaceholder(/Type a message/).fill("/cancel");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByLabel(/Current state/)).toContainText("IDLE");
  });
});
