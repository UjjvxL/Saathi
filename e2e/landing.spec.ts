import { expect, test } from "@playwright/test";

test.describe("landing page", () => {
  test("introduces Saathi and leads to sign up", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Saathi/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Care for the people who cared for you/);
    await expect(page.getByRole("heading", { name: /Much more than a reminder app/ })).toBeVisible();

    await page.getByRole("link", { name: "Start a care circle" }).click();
    await expect(page).toHaveURL(/\/signup/);
    await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
  });

  test("answers common questions", async ({ page }) => {
    await page.goto("/#faq");
    const question = page.getByText("Does my parent need a smartphone?");
    await question.click();
    await expect(page.getByText(/works without logging in/)).toBeVisible();
  });

  test("shares a rich preview and is installable", async ({ page, request }) => {
    await page.goto("/");
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /opengraph-image/);
    const manifest = await (await request.get("/manifest.webmanifest")).json();
    expect(manifest).toMatchObject({ short_name: "Saathi", display: "standalone" });
    expect((await request.get("/robots.txt")).ok()).toBe(true);
  });
});
