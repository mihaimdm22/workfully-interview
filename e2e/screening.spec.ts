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
 *
 * Routing model after the platform redesign:
 *   /                    — dashboard (workspace home)
 *   /screening/new       — active chat (FSM gathers JD + CV, evaluates)
 *   /screening/<id>      — read-only past verdict (redirected to after evaluation)
 *   /s/<slug>            — public share page
 */

const fixture = (name: string) =>
  path.resolve(__dirname, "..", "fixtures", name);

const NEW_SCREENING = "/screening/new";

test.describe("Screening flow", () => {
  test("idle → screening → JD → CV → verdict", async ({ page }) => {
    await page.goto(NEW_SCREENING);

    // Idle greeting visible
    await expect(page.getByLabel("Chat transcript")).toContainText(
      "I'm here to help",
    );
    await expect(page.getByLabel(/Current state/)).toContainText("IDLE");

    // Start screening
    await page.getByPlaceholder(/Type a message/).fill("/screen");
    await page.getByRole("button", { name: /Send|Evaluating/ }).click();
    await expect(page.getByLabel(/Current state/)).toContainText("SCREENING");
    await expect(page.getByLabel("Chat transcript")).toContainText(
      /job description/i,
    );

    // Provide JD
    await page
      .getByPlaceholder(/Type a message/)
      .fill("Senior Backend Engineer with TypeScript and Node.js");
    await page.getByRole("button", { name: /Send|Evaluating/ }).click();
    await expect(page.getByLabel("Chat transcript")).toContainText(/CV/);

    // Provide CV — verdict completes and we get redirected to /screening/<id>.
    await page
      .getByPlaceholder(/Type a message/)
      .fill("Elena Kowalski, 6 years TypeScript, NestJS, Postgres, AWS");
    await page.getByRole("button", { name: /Send|Evaluating/ }).click();

    // Wait for the redirect to the permanent screening URL.
    await page.waitForURL(/\/screening\/[A-Za-z0-9_-]{20,}/, {
      timeout: 30_000,
    });

    // Verdict header on the detail page.
    const verdict = page.getByTestId("verdict-header");
    await expect(verdict).toBeVisible({ timeout: 10_000 });
    await expect(verdict).toContainText(/Strong match/i);
  });

  test("upload-first: CV PDF then JD PDF auto-screens (the demo flow)", async ({
    page,
  }) => {
    await page.goto(NEW_SCREENING);

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

    // Now upload the JD PDF — both slots filled, FSM auto-evaluates and
    // redirects to /screening/<id>.
    await page
      .getByLabel("Upload PDF")
      .setInputFiles(fixture("job-description.pdf"));

    await page.waitForURL(/\/screening\/[A-Za-z0-9_-]{20,}/, {
      timeout: 30_000,
    });
    await expect(page.getByTestId("verdict-header")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("upload-first: JD PDF then CV PDF auto-screens", async ({ page }) => {
    await page.goto(NEW_SCREENING);
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

    await page.waitForURL(/\/screening\/[A-Za-z0-9_-]{20,}/, {
      timeout: 30_000,
    });
    await expect(page.getByTestId("verdict-header")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("cancel returns to idle and clears state", async ({ page }) => {
    await page.goto(NEW_SCREENING);
    await page.getByPlaceholder(/Type a message/).fill("/screen");
    await page.getByRole("button", { name: /Send|Evaluating/ }).click();
    await expect(page.getByLabel(/Current state/)).toContainText("SCREENING");

    await page.getByPlaceholder(/Type a message/).fill("/cancel");
    await page.getByRole("button", { name: /Send|Evaluating/ }).click();
    await expect(page.getByLabel(/Current state/)).toContainText("IDLE");
  });

  test("dashboard lists the screening after verdict", async ({ page }) => {
    // After the upload flow above, the dashboard should show the candidate.
    await page.goto(NEW_SCREENING);
    await page
      .getByLabel("Upload PDF")
      .setInputFiles(fixture("job-description.pdf"));
    // Wait for the FSM to advance before the second upload — back-to-back
    // setInputFiles races with the orchestrator's optimistic-CAS retry loop
    // because the second upload's snapshot version reads stale.
    await expect(page.getByLabel(/Current state/)).toContainText(
      /awaiting CV/i,
    );
    await page
      .getByLabel("Upload PDF")
      .setInputFiles(fixture("cv-strong-match.pdf"));
    await page.waitForURL(/\/screening\/[A-Za-z0-9_-]{20,}/, {
      timeout: 30_000,
    });

    // Navigate to the dashboard — sidebar shows the new screening, grid does too.
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Screenings" }),
    ).toBeVisible();
    await expect(page.getByText(/Test Candidate/i).first()).toBeVisible();
    await expect(page.getByText(/Strong match/i).first()).toBeVisible();
  });

  test("sidebar history persists across '+ New screening'", async ({
    page,
  }) => {
    // Produce a verdict, then click "+ New screening" and assert the prior
    // candidate is still visible in the sidebar — the regression this PR
    // fixes (clearing the cookie used to orphan all old screenings).
    await page.goto(NEW_SCREENING);
    await page
      .getByLabel("Upload PDF")
      .setInputFiles(fixture("job-description.pdf"));
    await expect(page.getByLabel(/Current state/)).toContainText(
      /awaiting CV/i,
    );
    await page
      .getByLabel("Upload PDF")
      .setInputFiles(fixture("cv-strong-match.pdf"));
    await page.waitForURL(/\/screening\/[A-Za-z0-9_-]{20,}/, {
      timeout: 30_000,
    });

    // Sidebar shows the verdict on the detail page.
    const sidebar = page.locator("aside[aria-label='Workspace navigation']");
    await expect(sidebar.getByText(/Test Candidate/i)).toBeVisible();

    // Click "+ New screening" — the new flow should land on /screening/new
    // (with a ?reset=1 marker that the toast reads, then strips), with the
    // chat empty but the sidebar history intact.
    await sidebar.getByRole("button", { name: /\+ New screening/ }).click();
    await page.waitForURL(/\/screening\/new(\?.*)?$/, { timeout: 10_000 });

    // Sidebar still shows the prior verdict — this is the whole point.
    await expect(sidebar.getByText(/Test Candidate/i)).toBeVisible();

    // Chat is fresh — only the bot greeting, no carried-over user messages.
    await expect(page.getByLabel("Chat transcript")).toContainText(
      "I'm here to help",
    );
    await expect(page.getByLabel("Chat transcript")).not.toContainText(
      /Strong match/i,
    );
  });

  test("'+ New screening' double-click does not error", async ({ page }) => {
    // After the action shipped the delete-then-dispatch + retry path, two
    // rapid clicks would race the optimistic CAS write. The action retries
    // once on ConcurrentModificationError, so the user-visible result of a
    // double-click should be identical to a single click.
    await page.goto(NEW_SCREENING);
    await page
      .getByLabel("Upload PDF")
      .setInputFiles(fixture("job-description.pdf"));
    await expect(page.getByLabel(/Current state/)).toContainText(
      /awaiting CV/i,
    );
    await page
      .getByLabel("Upload PDF")
      .setInputFiles(fixture("cv-strong-match.pdf"));
    await page.waitForURL(/\/screening\/[A-Za-z0-9_-]{20,}/, {
      timeout: 30_000,
    });

    const sidebar = page.locator("aside[aria-label='Workspace navigation']");
    const newButton = sidebar.getByRole("button", { name: /\+ New screening/ });

    // Fire two clicks back-to-back. useFormStatus() disables the button as
    // soon as the first submit starts, so the second click usually no-ops at
    // the DOM level — but if it slips through, the action's CME retry
    // handles the race at the server.
    await Promise.all([newButton.click(), newButton.click().catch(() => {})]);
    await page.waitForURL(/\/screening\/new(\?.*)?$/, { timeout: 10_000 });

    // No error toast / banner visible.
    await expect(page.getByRole("alert")).toHaveCount(0);

    // Sidebar history still has the original screening.
    await expect(sidebar.getByText(/Test Candidate/i)).toBeVisible();
  });

  test("public share link renders without sidebar or chat log", async ({
    page,
  }) => {
    // Run a screening, generate a share link, then visit /s/<slug>.
    await page.goto(NEW_SCREENING);
    await page
      .getByLabel("Upload PDF")
      .setInputFiles(fixture("job-description.pdf"));
    // See note in the test above — wait for `awaiting CV` so the second
    // upload doesn't race the orchestrator's optimistic-CAS loop.
    await expect(page.getByLabel(/Current state/)).toContainText(
      /awaiting CV/i,
    );
    await page
      .getByLabel("Upload PDF")
      .setInputFiles(fixture("cv-strong-match.pdf"));
    await page.waitForURL(/\/screening\/[A-Za-z0-9_-]{20,}/, {
      timeout: 30_000,
    });

    // Click "Generate share link" → expect the read-only share row to expose
    // the slug, then navigate to /s/<slug> and assert privacy-safe content.
    await page.getByRole("button", { name: /Generate share link/i }).click();
    const shareInput = page.locator("text=/^https?:\\/\\/.*\\/s\\//");
    await expect(shareInput).toBeVisible({ timeout: 10_000 });
    const url = await shareInput.first().textContent();
    expect(url).toMatch(/\/s\/[a-z0-9]{20,}/);
    const slug = url!.split("/s/")[1]!.trim();

    await page.goto(`/s/${slug}`);
    // Workfully wordmark on the bare layout, no sidebar.
    await expect(page.getByRole("main")).toContainText("Workfully");
    await expect(
      page.locator("aside[aria-label='Workspace navigation']"),
    ).toHaveCount(0);
    // Public page must NOT expose the conversation log.
    await expect(page.locator("details:has-text('Conversation')")).toHaveCount(
      0,
    );
  });
});
