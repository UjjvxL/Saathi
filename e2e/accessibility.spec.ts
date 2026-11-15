import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { addMedicine, createCareProfile, indiaTime, signUp, uniqueEmail } from "./helpers";

// Automated WCAG 2.1 AA checks (axe-core). Serious and critical problems fail the build.
async function expectAccessible(page: Page) {
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveTitle(/Saathi/);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const problems = results.violations
    .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
    .map((violation) => `${violation.id}: ${violation.help} (${violation.nodes.map((node) => node.target.join(" ")).join(", ")})`);
  expect(problems, problems.join("\n")).toEqual([]);
}

test.describe("accessibility", () => {
  // Many older users turn on "reduce motion"; it also means contrast is measured after fade-ins finish.
  test.use({ reducedMotion: "reduce" });

  for (const path of ["/", "/login", "/signup", "/forgot-password"]) {
    test(`public page ${path}`, async ({ page }) => {
      await page.goto(path);
      await expectAccessible(page);
    });
  }

  test("signed-in pages", async ({ page }) => {
    await signUp(page, "Access Tester", uniqueEmail("a11y"));
    await expectAccessible(page); // empty dashboard

    const { profilePath } = await createCareProfile(page, "Kamala Devi", uniqueEmail("kamala"));
    await addMedicine(page, profilePath, "Metformin", "500 mg", indiaTime(30));
    for (const path of ["/dashboard", profilePath, `${profilePath}/medications`, `${profilePath}/medications/new`, `${profilePath}/appointments`, `${profilePath}/history`, `${profilePath}/circle`, "/join", "/profiles/new"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await expectAccessible(page);
    }
  });
});
