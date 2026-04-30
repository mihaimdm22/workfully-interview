import { test, expect } from "@playwright/test";

/**
 * E2E for the settings modal.
 *
 * Asserts the full path: open the modal from the topbar gear icon, change
 * the model, save, run a screening, see the new model id reflected on the
 * verdict header. With WORKFULLY_FAKE_AI=1 the fake AI echoes the resolved
 * model id, so the assertion proves the wire from settings → DB → resolver
 * → screening actor → verdict UI is intact end-to-end.
 *
 * Requires the same harness as `screening.spec.ts`:
 *   - Postgres up + migrated
 *   - WORKFULLY_FAKE_AI=1 pnpm dev
 */

const NEW_SCREENING = "/screening/new";

test.describe("Settings modal", () => {
  test("change model in modal → next screening uses the new model", async ({
    page,
  }) => {
    await page.goto(NEW_SCREENING);

    // Open the settings modal from the topbar gear icon.
    await page.getByRole("button", { name: /Open AI settings/ }).click();
    const dialog = page.getByRole("dialog", { name: /AI settings/ });
    await expect(dialog).toBeVisible();

    // Pick a non-default model. The dropdown is populated lazily on open;
    // wait for it to appear before selecting.
    const modelSelect = dialog.locator("select").first();
    await expect(modelSelect).toBeVisible({ timeout: 10_000 });
    await modelSelect.selectOption({ value: "anthropic/claude-sonnet-4.6" });

    // Save and confirm the modal closes.
    await dialog.getByRole("button", { name: /^Save$/ }).click();
    await expect(dialog).toBeHidden({ timeout: 5_000 });

    // Re-open to confirm persistence — the saved model should be the
    // currently selected option.
    await page.getByRole("button", { name: /Open AI settings/ }).click();
    const dialog2 = page.getByRole("dialog", { name: /AI settings/ });
    await expect(dialog2.locator("select").first()).toHaveValue(
      "anthropic/claude-sonnet-4.6",
    );
    // Close again so the rest of the flow has a clean viewport.
    await dialog2.getByRole("button", { name: /Cancel/ }).click();
    await expect(dialog2).toBeHidden();

    // Run a fake-AI screening and assert the verdict header reflects the
    // model id we just picked. With WORKFULLY_FAKE_AI=1, fakeScreen echoes
    // the resolved model id.
    await page.getByPlaceholder(/Type a message/).fill("/screen");
    await page.getByRole("button", { name: /Send|Evaluating/ }).click();

    await page
      .getByPlaceholder(/Type a message/)
      .fill("Senior Backend Engineer with TypeScript and Node.js");
    await page.getByRole("button", { name: /Send|Evaluating/ }).click();

    await page
      .getByPlaceholder(/Type a message/)
      .fill("Elena Kowalski, 6 years TypeScript, NestJS, Postgres, AWS");
    await page.getByRole("button", { name: /Send|Evaluating/ }).click();

    await page.waitForURL(/\/screening\/[A-Za-z0-9_-]{20,}/, {
      timeout: 30_000,
    });

    const verdict = page.getByTestId("verdict-header");
    await expect(verdict).toBeVisible({ timeout: 10_000 });
    // The model id is rendered in mono on the meta line below the score.
    await expect(verdict).toContainText("anthropic/claude-sonnet-4.6");
  });

  test("modal closes on cancel without persisting changes", async ({
    page,
  }) => {
    await page.goto(NEW_SCREENING);

    await page.getByRole("button", { name: /Open AI settings/ }).click();
    const dialog = page.getByRole("dialog", { name: /AI settings/ });
    await expect(dialog).toBeVisible();

    const modelSelect = dialog.locator("select").first();
    await expect(modelSelect).toBeVisible({ timeout: 10_000 });
    const originalValue = await modelSelect.inputValue();

    // Pick something different from the persisted value.
    const otherValue =
      originalValue === "anthropic/claude-haiku-4.5"
        ? "anthropic/claude-sonnet-4.6"
        : "anthropic/claude-haiku-4.5";
    await modelSelect.selectOption({ value: otherValue });

    // Cancel — modal closes, change is discarded.
    await dialog.getByRole("button", { name: /Cancel/ }).click();
    await expect(dialog).toBeHidden();

    // Re-open: the persisted value should still be the original.
    await page.getByRole("button", { name: /Open AI settings/ }).click();
    const dialog2 = page.getByRole("dialog", { name: /AI settings/ });
    await expect(dialog2.locator("select").first()).toHaveValue(originalValue);
  });
});
