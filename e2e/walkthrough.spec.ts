import { test, expect } from "@playwright/test";

/**
 * Smoke E2E for the /walkthrough portfolio page.
 *
 * Asserts:
 *   - Topbar discovery link from / navigates to /walkthrough
 *   - Page renders without throwing during server-side render
 *   - Hero h1 is present
 *   - basetool.ai author link is present
 *   - Verdict gallery renders 3 verdict cards (uses test ids on existing
 *     <VerdictHeader> share components)
 *
 * The page is `force-static`, so DB / OpenRouter availability is irrelevant
 * here. The only requirement is the dev server.
 */
test.describe("Walkthrough page", () => {
  test("dashboard topbar links to /walkthrough; page renders all critical sections", async ({
    page,
  }) => {
    // Land on the dashboard
    await page.goto("/");

    // Topbar "About this project" link is present and navigable
    const aboutLink = page.getByRole("link", {
      name: /Read the architecture walkthrough/i,
    });
    await expect(aboutLink).toBeVisible();
    await aboutLink.click();

    // We should be on /walkthrough
    await expect(page).toHaveURL(/\/walkthrough$/);

    // Hero h1 — headline, not just "Workfully" eyebrow
    await expect(
      page.getByRole("heading", { level: 1, name: /finite-state-machine/i }),
    ).toBeVisible();

    // basetool.ai author link present (hero variant)
    const personalSiteLink = page.getByRole("link", {
      name: /personal site/i,
    });
    await expect(personalSiteLink.first()).toBeVisible();
    await expect(personalSiteLink.first()).toHaveAttribute(
      "href",
      "https://basetool.ai/en/about/david",
    );

    // Verdict gallery — three cards rendered via the existing share components
    const verdictHeaders = page.getByTestId("verdict-header");
    await expect(verdictHeaders).toHaveCount(3);

    // Try-it CTA in the hero links to /screening/new
    const tryItHero = page.getByRole("link", { name: /Try it now/i }).first();
    await expect(tryItHero).toHaveAttribute("href", "/screening/new");
  });
});
