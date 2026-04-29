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
