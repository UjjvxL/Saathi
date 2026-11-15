import { expect, test } from "@playwright/test";
import { addMedicine, createCareProfile, CRON_SECRET, field, indiaTime, linkIn, signUp, uniqueEmail, waitForEmail } from "./helpers";

test("a family sets up care, shares it, and the elder confirms a dose from email", async ({ browser, request }) => {
  const elderEmail = uniqueEmail("kamala");

  // Rahul creates his mother's care profile and adds a medicine due in 10 minutes.
  const rahulContext = await browser.newContext();
  const rahul = await rahulContext.newPage();
  await signUp(rahul, "Rahul Sharma", uniqueEmail("rahul"));
  await expect(rahul.getByRole("heading", { name: /Welcome, Rahul/ })).toBeVisible();
  const { careId, passcode, profilePath } = await createCareProfile(rahul, "Kamala Devi", elderEmail);
  expect(careId).toMatch(/^[A-Z2-9]{6}$/);
  expect(passcode).toMatch(/^\d{6}$/);
  await addMedicine(rahul, profilePath, "Amlodipine", "5 mg", indiaTime(10));

  // He marks it taken by mistake, then undoes it.
  await rahul.getByRole("link", { name: "Today" }).click();
  await rahul.getByRole("button", { name: "I took it for Amlodipine" }).click();
  await expect(rahul.getByText(/marked by Rahul Sharma/)).toBeVisible();
  await rahul.getByRole("button", { name: "Undo taken for Amlodipine" }).click();
  await expect(rahul.getByRole("button", { name: "I took it for Amlodipine" })).toBeVisible();

  // Priya, the caretaker, joins with the Care ID and passcode (typed loosely).
  const priyaContext = await browser.newContext();
  const priya = await priyaContext.newPage();
  await priya.goto("/join");
  await expect(priya).toHaveURL(/\/login\?next=%2Fjoin/);
  await priya.getByRole("link", { name: "Create an account" }).click();
  await field(priya, "Your name").fill("Priya Nair");
  await field(priya, "Email").fill(uniqueEmail("priya"));
  await field(priya, "Password").fill("caretaker-pass-1");
  await priya.getByRole("button", { name: "Create account" }).click();
  await priya.waitForURL("**/join");
  await field(priya, "Care ID").fill(careId.toLowerCase());
  await field(priya, "Passcode").fill(passcode);
  await field(priya, "Caretaker").check();
  await priya.getByRole("button", { name: "Join care circle" }).click();
  await priya.waitForURL(`**${profilePath}`);
  await expect(priya.getByRole("button", { name: "I took it for Amlodipine" })).toBeVisible();

  // The reminder engine runs (Cloud Scheduler does this every 5 minutes).
  const cron = await request.post("/api/cron/reminders", { headers: { authorization: `Bearer ${CRON_SECRET}` } });
  expect(cron.ok()).toBe(true);
  expect((await cron.json()).upcoming).toBeGreaterThanOrEqual(1);

  // Kamala opens "I've taken them" from her email, without logging in.
  const reminder = await waitForEmail((email) => email.to === elderEmail && email.subject.startsWith("Medicine time"));
  const elderContext = await browser.newContext();
  const elder = await elderContext.newPage();
  await elder.goto(linkIn(reminder, "/confirm"));
  await expect(elder.getByRole("heading", { name: "Did Kamala Devi take these medicines?" })).toBeVisible();
  await elder.getByRole("button", { name: "Yes, I took them" }).click();
  await expect(elder.getByText(/Thank you/).first()).toBeVisible();

  // Rahul sees it, and every step is in the activity log.
  await rahul.reload();
  await expect(rahul.getByText(/marked by Kamala Devi \(email link\)/)).toBeVisible();
  await rahul.getByRole("link", { name: "History" }).click();
  await expect(rahul.getByText("Priya Nair joined as caretaker")).toBeVisible();
  await expect(rahul.getByText(/Kamala Devi \(email link\) marked Amlodipine 5 mg/)).toBeVisible();

  // Priya can see the circle but can't regenerate the passcode (she isn't an admin).
  await priya.goto(`${profilePath}/circle`);
  await expect(priya.getByText("Members (2)")).toBeVisible();
  await expect(priya.getByRole("button", { name: /Generate a new passcode/ })).toHaveCount(0);

  await Promise.all([rahulContext.close(), priyaContext.close(), elderContext.close()]);
});

test("strangers can't open someone else's care profile", async ({ browser }) => {
  const ownerContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  await signUp(owner, "Owner Person", uniqueEmail("owner"));
  const { profilePath } = await createCareProfile(owner, "Private Elder", uniqueEmail("private"));

  const strangerContext = await browser.newContext();
  const stranger = await strangerContext.newPage();
  await signUp(stranger, "Nosy Neighbour", uniqueEmail("nosy"));
  await stranger.goto(profilePath);
  await expect(stranger.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await expect(stranger.getByText("Private Elder")).toHaveCount(0);

  await Promise.all([ownerContext.close(), strangerContext.close()]);
});
