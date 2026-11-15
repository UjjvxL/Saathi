import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { addMedicine, createCareProfile, indiaTime, signUp, uniqueEmail } from "./helpers";

test.describe("health insights", () => {
  test.use({ reducedMotion: "reduce" });

  test("shows the week's numbers from real dose records, accessibly", async ({ page }) => {
    await signUp(page, "Insight Tester", uniqueEmail("insights"));
    const { profilePath } = await createCareProfile(page, "Kamala Devi", uniqueEmail("kamala"));
    await addMedicine(page, profilePath, "Metformin", "500 mg", indiaTime(30));

    // Before anything is recorded, nothing is counted yet.
    await page.goto(`${profilePath}/insights`);
    await expect(page.getByRole("heading", { name: "Health insights" })).toBeVisible();
    await expect(page.getByText("None of this week’s doses have been due long enough to count yet.")).toBeVisible();

    // Mark the dose as taken on the Today page; the insights now count it.
    await page.goto(profilePath);
    await page.getByRole("button", { name: "I took it for Metformin" }).click();
    await expect(page.getByText(/marked by Insight Tester/)).toBeVisible();

    await page.goto(`${profilePath}/insights`);
    await expect(page.getByText("Kamala Devi took every dose this week (1 of 1).")).toBeVisible();
    const tiles = page.getByRole("region", { name: "This week in numbers" });
    await expect(tiles.getByText("100%")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Data used" })).toBeVisible();
    await expect(page.getByText("1 scheduled dose counted: 1 taken, 0 skipped, 0 missed and 0 unconfirmed.")).toBeVisible();
    // No Gemini key on the test server: no AI button, only Saathi's own summary.
    await expect(page.getByRole("button", { name: /Gemini/ })).toHaveCount(0);

    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const problems = results.violations
      .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
      .map((violation) => `${violation.id}: ${violation.help} (${violation.nodes.map((node) => node.target.join(" ")).join(", ")})`);
    expect(problems, problems.join("\n")).toEqual([]);
  });
});
