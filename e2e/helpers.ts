import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, type Locator, type Page } from "@playwright/test";

export const CRON_SECRET = "e2e-cron-secret";
const OUTBOX = path.resolve("e2e/.outbox");

export interface OutboxEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * A visible form field by its label. Next.js keeps previously visited pages mounted (hidden),
 * so a label like "Email" can also match a field on a hidden page.
 */
export function field(page: Page, label: string | RegExp): Locator {
  return page.getByLabel(label).filter({ visible: true });
}

export function uniqueEmail(name: string): string {
  return `${name.toLowerCase()}.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@example.com`;
}

/** HH:mm in India, `minutes` from now (the profiles in these tests use Asia/Kolkata). */
export function indiaTime(minutes: number): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(
    new Date(Date.now() + minutes * 60_000),
  );
}

export function readOutbox(): OutboxEmail[] {
  return readdirSync(OUTBOX)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => JSON.parse(readFileSync(path.join(OUTBOX, file), "utf8")) as OutboxEmail);
}

export async function waitForEmail(match: (email: OutboxEmail) => boolean): Promise<OutboxEmail> {
  let found: OutboxEmail | undefined;
  await expect.poll(() => (found = readOutbox().find(match)), { timeout: 10_000 }).toBeTruthy();
  return found as OutboxEmail;
}

export function linkIn(email: OutboxEmail, pathName: string): string {
  const match = email.text.match(new RegExp(`https?://[^\\s]+${pathName.replace("/", "\\/")}\\?token=[^\\s]+`));
  if (!match) throw new Error(`No ${pathName} link in "${email.subject}"`);
  return match[0];
}

export async function signUp(page: Page, name: string, email: string, password = "e2e-password-123") {
  await page.goto("/signup");
  await field(page, "Your name").fill(name);
  await field(page, "Email").fill(email);
  await field(page, "Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/dashboard");
}

export async function createCareProfile(page: Page, elderName: string, elderEmail: string) {
  await page.goto("/profiles/new");
  await field(page, "Elder’s full name").fill(elderName);
  await field(page, "Elder’s email (optional)").fill(elderEmail);
  await page.getByRole("button", { name: "Create care profile" }).click();
  await expect(page.getByText("Care profile created")).toBeVisible();
  const codes = page.locator("dl dd").filter({ visible: true });
  const careId = (await codes.nth(0).innerText()).trim();
  const passcode = (await codes.nth(1).innerText()).trim();
  await page.getByRole("link", { name: "Open care profile" }).click();
  await expect(page.getByRole("heading", { level: 1, name: elderName })).toBeVisible();
  const profilePath = new URL(page.url()).pathname;
  return { careId, passcode, profilePath };
}

export async function addMedicine(page: Page, profilePath: string, name: string, dosage: string, time: string) {
  await page.goto(`${profilePath}/medications/new`);
  await field(page, "Medicine name").fill(name);
  await field(page, "Dose / strength").fill(dosage);
  await field(page, "Time 1").fill(time);
  await page.getByRole("button", { name: "Save medicine" }).click();
  await page.waitForURL(`**${profilePath}/medications`);
  await expect(page.getByRole("heading", { name: new RegExp(name) })).toBeVisible();
}
