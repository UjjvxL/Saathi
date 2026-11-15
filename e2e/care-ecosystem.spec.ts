import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { createCareProfile, CRON_SECRET, field, signUp, uniqueEmail, waitForEmail } from "./helpers";

/** A dose time a few minutes from now, as "HH:mm" in India plus the exact instant it falls due. */
function indiaSlot(minutesAhead: number) {
  const at = new Date(Math.floor((Date.now() + minutesAhead * 60_000) / 60_000) * 60_000);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(at);
  return { time, at };
}

/** Runs the reminder engine as if it were `minutesAfterDue` minutes after the dose (the test server allows this). */
async function runRemindersAt(request: APIRequestContext, due: Date, minutesAfterDue: number) {
  const now = new Date(due.getTime() + minutesAfterDue * 60_000).toISOString();
  const response = await request.post(`/api/cron/reminders?now=${encodeURIComponent(now)}`, {
    headers: { authorization: `Bearer ${CRON_SECRET}` },
  });
  expect(response.ok()).toBe(true);
  return response.json();
}

async function joinCircle(page: Page, careId: string, passcode: string, role: "Caretaker" | "Family") {
  await page.goto("/join");
  await field(page, "Care ID").fill(careId);
  await field(page, "Passcode").fill(passcode);
  await field(page, role).check();
  await page.getByRole("button", { name: "Join care circle" }).click();
}

test("an unconfirmed dose is escalated to the responsible caretaker, followed up and recorded", async ({ browser, request }) => {
  test.setTimeout(150_000);
  const priyaEmail = uniqueEmail("priya");

  // Rahul sets up his mother's circle; Priya joins as her caretaker.
  const rahulContext = await browser.newContext();
  const rahul = await rahulContext.newPage();
  await signUp(rahul, "Rahul Sharma", uniqueEmail("rahul"));
  const { careId, passcode, profilePath } = await createCareProfile(rahul, "Kamala Devi", uniqueEmail("kamala"));

  const priyaContext = await browser.newContext();
  const priya = await priyaContext.newPage();
  await signUp(priya, "Priya Nair", priyaEmail);
  await joinCircle(priya, careId, passcode, "Caretaker");
  await priya.waitForURL(`**${profilePath}`);

  // Rahul adds a medicine and makes Priya responsible for it.
  const { time, at } = indiaSlot(4);
  await rahul.goto(`${profilePath}/medications/new`);
  await field(rahul, "Medicine name").fill("Amlodipine");
  await field(rahul, "Dose / strength").fill("5 mg");
  await field(rahul, "Time 1").fill(time);
  await field(rahul, "Responsible person").selectOption({ label: "Priya Nair (caretaker)" });
  await rahul.getByRole("button", { name: "Save medicine" }).click();
  await rahul.waitForURL(`**${profilePath}/medications`);
  await expect(rahul.getByText("Priya Nair is responsible")).toBeVisible();

  await rahul.goto(`${profilePath}/circle`);
  await expect(rahul.getByText("Responsible for: Amlodipine 5 mg")).toBeVisible();
  await expect(rahul.getByRole("region", { name: "Pending responsibilities" }).getByText("Amlodipine 5 mg")).toBeVisible();

  // The engine runs at the dose time, then 16 and 31 minutes later (nobody confirms the dose).
  expect((await runRemindersAt(request, at, -2)).upcoming).toBeGreaterThanOrEqual(1);
  expect((await runRemindersAt(request, at, 16)).followUps).toBeGreaterThanOrEqual(1);
  expect((await runRemindersAt(request, at, 31)).escalated).toBeGreaterThanOrEqual(1);

  // Priya, the responsible caretaker, gets the alert and taps "I'm on it" from her inbox.
  const alert = await waitForEmail((email) => email.to === priyaEmail && email.subject.startsWith("Action needed: Kamala Devi"));
  expect(alert.subject).not.toContain("Amlodipine");
  const ackLink = alert.text.match(/https?:\/\/\S+\/alerts\/ack\?token=\S+/)?.[0];
  expect(ackLink).toBeTruthy();
  await priya.goto(ackLink as string);
  await expect(priya.getByRole("heading", { name: "Can you check on Kamala Devi?" })).toBeVisible();
  await priya.getByRole("button", { name: /I’m on it/ }).click();
  await expect(priya.getByText(/Thank you\. Everyone can see you’re following up/)).toBeVisible();

  // Rahul sees who is following up.
  await rahul.reload();
  await expect(rahul.getByText("Priya Nair acknowledged and is following up").first()).toBeVisible();

  // After calling her, Priya records that the dose was taken late; the alert closes itself.
  await priya.goto(profilePath);
  await expect(priya.getByText("Unconfirmed").first()).toBeVisible();
  await priya.getByRole("button", { name: "Taken late for Amlodipine" }).click();
  await expect(priya.getByText(/marked by Priya Nair/)).toBeVisible();

  // The timeline holds the whole story, and can be filtered by member.
  await rahul.goto(`${profilePath}/timeline`);
  await expect(rahul.getByRole("heading", { name: /Escalation history \(1\)/ })).toBeVisible();
  await expect(rahul.getByText(/Follow-up reminder sent to/).first()).toBeVisible();
  await expect(rahul.getByText(/was still unconfirmed after 30 minutes\. Priya Nair \(responsible\) was alerted by email/).first()).toBeVisible();
  await expect(rahul.getByText(/Priya Nair acknowledged the .* alert and is following up/).first()).toBeVisible();
  await expect(rahul.getByText(/alert resolved: the medicines were marked as taken by Priya Nair/).first()).toBeVisible();

  await field(rahul, "Member").selectOption({ label: "Priya Nair" });
  await rahul.getByRole("button", { name: "Show" }).click();
  await expect(rahul.getByText(/Priya Nair acknowledged the/).first()).toBeVisible();
  await expect(rahul.getByText("Rahul Sharma created this care profile")).toHaveCount(0);

  await Promise.all([rahulContext.close(), priyaContext.close()]);
});

test("family members can follow along but can't change medicines or manage the circle", async ({ browser }) => {
  const ownerContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  await signUp(owner, "Owner Person", uniqueEmail("owner"));
  const { careId, passcode, profilePath } = await createCareProfile(owner, "Kamala Devi", uniqueEmail("kamala"));

  const anilContext = await browser.newContext();
  const anil = await anilContext.newPage();
  await signUp(anil, "Anil Sharma", uniqueEmail("anil"));

  // A wrong passcode is refused.
  await joinCircle(anil, careId, "000000", "Family");
  await expect(anil.getByText(/don’t match/)).toBeVisible();

  await joinCircle(anil, careId, passcode, "Family");
  await anil.waitForURL(`**${profilePath}`);

  await anil.goto(`${profilePath}/medications`);
  await expect(anil.getByRole("heading", { name: "Medicines", exact: true })).toBeVisible();
  await expect(anil.getByRole("link", { name: "Add medicine" })).toHaveCount(0);
  await anil.goto(`${profilePath}/medications/new`);
  await expect(anil.getByText("Only caretakers and admins can add medicines.")).toBeVisible();

  await anil.goto(`${profilePath}/circle`);
  await expect(anil.getByRole("table")).toContainText("Add and edit medicine schedules");
  await expect(anil.getByRole("button", { name: /Generate a new passcode/ })).toHaveCount(0);

  await Promise.all([ownerContext.close(), anilContext.close()]);
});
