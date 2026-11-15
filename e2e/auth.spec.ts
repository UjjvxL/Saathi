import { expect, test } from "@playwright/test";
import { field, linkIn, signUp, uniqueEmail, waitForEmail } from "./helpers";

test.describe("accounts", () => {
  test("protected pages send visitors to log in and back", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/);
  });

  test("shows a clear error for a wrong password", async ({ page }) => {
    const email = uniqueEmail("wrong");
    await signUp(page, "Wrong Password", email);
    await page.getByRole("button", { name: "Log out" }).click();
    await page.waitForURL("**/login");

    await field(page, "Email").fill(email);
    await field(page, "Password").fill("not-my-password");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "incorrect" })).toHaveText("Email or password is incorrect.");
  });

  test("resets a forgotten password from the email link", async ({ page, context }) => {
    const email = uniqueEmail("forgetful");
    await signUp(page, "Forgetful User", email);
    await context.clearCookies();

    await page.goto("/login");
    await page.getByRole("link", { name: "Forgot password?" }).click();
    await field(page, "Email").fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByText("Check your email")).toBeVisible();

    const resetEmail = await waitForEmail((message) => message.to === email && message.subject.includes("Reset"));
    await page.goto(linkIn(resetEmail, "/reset-password"));
    await field(page, /^New password/).fill("brand-new-password");
    await field(page, "Confirm new password").fill("brand-new-password");
    await page.getByRole("button", { name: "Save new password" }).click();
    await page.waitForURL("**/dashboard");

    // The link can't be used twice.
    await page.goto(linkIn(resetEmail, "/reset-password"));
    await expect(page.getByRole("heading", { name: "This link has expired" })).toBeVisible();

    // And the new password works.
    await context.clearCookies();
    await page.goto("/login");
    await field(page, "Email").fill(email);
    await field(page, "Password").fill("brand-new-password");
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("**/dashboard");
  });
});
