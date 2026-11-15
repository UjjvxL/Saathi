import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { installFakeSpeech, isListening, say, spokenTexts, to12h } from "./elder-helpers";
import { addMedicine, createCareProfile, indiaTime, signUp, uniqueEmail } from "./helpers";

// Many older users turn on "reduce motion"; it also means contrast is measured after animations.
test.use({ reducedMotion: "reduce" });

async function expectAccessible(page: Page) {
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveTitle(/Elderly mode/);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const problems = results.violations
    .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
    .map((violation) => `${violation.id}: ${violation.help} (${violation.nodes.map((node) => node.target.join(" ")).join(", ")})`);
  expect(problems, problems.join("\n")).toEqual([]);
}

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test.describe("elderly mode", () => {
  test("the voice assistant answers questions and records a dose only after a spoken yes", async ({ page }) => {
    await installFakeSpeech(page);
    await signUp(page, "Rahul Sharma", uniqueEmail("rahul"));
    const { profilePath } = await createCareProfile(page, "Kamala Devi", uniqueEmail("kamala"));
    const time = indiaTime(10);
    await addMedicine(page, profilePath, "Amlodipine", "5 mg", time);

    await page.goto(profilePath);
    await page.getByRole("link", { name: "Elderly mode" }).click();
    await page.waitForURL("**/elder/**");
    await expect(page.getByRole("heading", { level: 1, name: /, Kamala$/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: `Next medicine at ${to12h(time)}` })).toBeVisible();

    // "What medicines do I need to take today?"
    await page.getByRole("button", { name: "Tap to speak" }).click();
    await say(page, "What medicines do I need to take today?");
    await expect(page.getByText("I heard: “What medicines do I need to take today?”")).toBeVisible();
    await expect(page.getByText(`Today you have 1 medicine. At ${to12h(time)}: Amlodipine 5 mg, still to come.`)).toBeVisible();
    await expect.poll(() => spokenTexts(page)).toContainEqual(expect.stringContaining("Today you have 1 medicine."));

    // "I have taken my medicine" is confirmed first, and Saathi listens for the answer by itself.
    await page.getByRole("button", { name: "Tap to speak" }).click();
    await say(page, "I have taken my medicine");
    await expect(
      page.getByText(`You’re confirming Amlodipine 5 mg, the ${to12h(time)} dose. Is that right? Say yes or no.`),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Yes, that’s right" })).toBeVisible();
    await expect.poll(() => isListening(page)).toBe(true);
    await say(page, "yes");
    await expect(page.getByText("Done. I’ve marked Amlodipine 5 mg as taken. Well done!")).toBeVisible();
    await expect(page.getByRole("region", { name: "Today’s medicines" }).getByText("Taken")).toBeVisible();
    await expect(page.getByRole("heading", { name: "All done for today" })).toBeVisible();

    // The family sees who marked it in the full view.
    await page.getByRole("link", { name: "Back to full view" }).click();
    await page.waitForURL(`**${profilePath}`);
    await expect(page.getByText(/marked by Rahul Sharma/)).toBeVisible();
  });

  test("works by typing where speech recognition isn't available, and stays private", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await installFakeSpeech(page, { recognition: false });

    // Signed-out visitors are sent to log in first.
    await page.goto("/elder/000000000000000000000000");
    await expect(page).toHaveURL(/\/login\?next=%2Felder%2F/);

    await signUp(page, "Rahul Sharma", uniqueEmail("rahul"));
    const { profilePath } = await createCareProfile(page, "Kamala Devi", uniqueEmail("kamala"));
    const elderPath = profilePath.replace("/p/", "/elder/");
    await page.goto(elderPath);

    await expect(page.getByText(/Voice isn’t available in this browser/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Tap to speak" })).toHaveCount(0);
    await page.getByLabel("Type your question").fill("When is my next doctor's appointment?");
    await page.getByRole("button", { name: "Ask" }).click();
    await expect(page.getByText("You have no upcoming doctor’s appointments.")).toBeVisible();
    await page.getByRole("button", { name: "What medicines do I take today?" }).click();
    await expect(page.getByText("You have no medicines scheduled for today.")).toBeVisible();
    await expect.poll(() => spokenTexts(page)).toContain("You have no medicines scheduled for today.");

    // Someone outside the care circle can't open it.
    const strangerContext = await browser.newContext();
    const stranger = await strangerContext.newPage();
    await signUp(stranger, "Nosy Neighbour", uniqueEmail("nosy"));
    await stranger.goto(elderPath);
    await expect(stranger.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await expect(stranger.getByText("Kamala")).toHaveCount(0);

    await Promise.all([context.close(), strangerContext.close()]);
  });

  test("is accessible and fits a phone screen, even with extra large text", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installFakeSpeech(page);
    await signUp(page, "Access Tester", uniqueEmail("a11y"));
    const { profilePath } = await createCareProfile(page, "Kamala Devi", uniqueEmail("kamala"));
    await addMedicine(page, profilePath, "Metformin", "500 mg", indiaTime(30));
    await page.goto(profilePath.replace("/p/", "/elder/"));
    await expect(page.getByRole("heading", { name: /Next medicine at/ })).toBeVisible();

    await expectAccessible(page);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

    const textSize = page.getByRole("group", { name: "Text size" });
    await textSize.getByRole("button", { name: "Bigger text" }).click();
    await textSize.getByRole("button", { name: "Bigger text" }).click();
    await expect(textSize.getByText("Extra large")).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-text-size", "xlarge");
    await expectAccessible(page);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

    // The choice is remembered on the next visit.
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-text-size", "xlarge");
  });
});
