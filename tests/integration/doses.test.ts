import { describe, expect, it } from "vitest";
import { confirmDoseSlot, markDose, markSlot, unmarkDose } from "@/app/actions/doses";
import { DoseLog, Medication } from "@/lib/models";
import { confirmDoseUrl } from "@/lib/reminders";
import { todayInZone, zonedToUtc } from "@/lib/schedule";
import { addMember, createCircle, createMedication, createUser, formData, signInAs, signOut } from "./helpers";

const ZONE = "Asia/Kolkata";

/** A dose time a little in the past, so it can be marked right now. */
function recentSlot(minutesAgo = 20) {
  const instant = new Date(Date.now() - minutesAgo * 60_000);
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(instant);
  const localDate = todayInZone(ZONE, instant);
  return { time: parts, scheduledFor: zonedToUtc(localDate, parts, ZONE) };
}

async function setup(stock: number | null = 10) {
  const owner = await createUser("Rahul Sharma");
  const { profileId } = await createCircle(owner, { timezone: ZONE });
  const slot = recentSlot();
  const med = await createMedication(profileId, { times: [slot.time], stock, unitsPerDose: 1 });
  await signInAs(owner);
  return { owner, profileId, med, medId: med._id.toString(), slot, iso: slot.scheduledFor.toISOString() };
}

describe("marking doses", () => {
  it("records a taken dose, who marked it, and uses up stock", async () => {
    const { profileId, medId, iso } = await setup(10);
    expect((await markDose(profileId, medId, iso, "taken", {}, formData({}))).ok).toBe(true);

    const log = await DoseLog.findOne({ medicationId: medId }).lean();
    expect(log).toMatchObject({ status: "taken", loggedByName: "Rahul Sharma", stockDeducted: 1 });
    expect((await Medication.findById(medId).lean())?.stock).toBe(9);

    // Marking it again doesn't double-count.
    await markDose(profileId, medId, iso, "taken", {}, formData({}));
    expect((await Medication.findById(medId).lean())?.stock).toBe(9);
  });

  it("puts stock back when a taken dose is changed to skipped or undone", async () => {
    const { profileId, medId, iso } = await setup(10);
    await markDose(profileId, medId, iso, "taken", {}, formData({}));
    await markDose(profileId, medId, iso, "skipped", {}, formData({}));
    expect((await Medication.findById(medId).lean())?.stock).toBe(10);

    await markDose(profileId, medId, iso, "taken", {}, formData({}));
    await unmarkDose(profileId, medId, iso, {}, formData({}));
    expect(await DoseLog.countDocuments({ medicationId: medId })).toBe(0);
    expect((await Medication.findById(medId).lean())?.stock).toBe(10);
  });

  it("rejects doses that aren't on the schedule", async () => {
    const { profileId, medId, slot } = await setup();
    const forged = new Date(slot.scheduledFor.getTime() + 60_000).toISOString();
    expect((await markDose(profileId, medId, forged, "taken", {}, formData({}))).message).toMatch(/couldn’t be found/);
    expect(await DoseLog.countDocuments({})).toBe(0);
  });

  it("doesn't allow marking far-future doses", async () => {
    const owner = await createUser("Rahul");
    const { profileId } = await createCircle(owner, { timezone: ZONE });
    const later = recentSlot(-5 * 60); // five hours from now
    const med = await createMedication(profileId, { times: [later.time] });
    await signInAs(owner);
    const state = await markDose(profileId, med._id.toString(), later.scheduledFor.toISOString(), "taken", {}, formData({}));
    expect(state.message).toMatch(/isn’t due yet/);
  });

  it("refuses people outside the care circle", async () => {
    const { profileId, medId, iso } = await setup();
    await signInAs(await createUser("Stranger"));
    expect((await markDose(profileId, medId, iso, "taken", {}, formData({}))).message).toMatch(/don’t have access/);
  });

  it("marks every open medicine in a time slot at once", async () => {
    const { profileId, medId, slot, iso } = await setup();
    const second = await createMedication(profileId, { name: "Amlodipine", times: [slot.time] });
    const third = await createMedication(profileId, { name: "Vitamin D3", times: [slot.time] });
    await markDose(profileId, third._id.toString(), iso, "skipped", {}, formData({}));

    expect((await markSlot(profileId, iso, "taken", {}, formData({}))).ok).toBe(true);
    const logs = await DoseLog.find({ profileId }).lean();
    const byMed = Object.fromEntries(logs.map((log) => [log.medicationId.toString(), log.status]));
    expect(byMed[medId]).toBe("taken");
    expect(byMed[second._id.toString()]).toBe("taken");
    expect(byMed[third._id.toString()]).toBe("skipped"); // an earlier decision isn't overwritten
  });
});

describe("confirming from a reminder email", () => {
  it("lets the elder confirm without logging in", async () => {
    const { profileId, medId, iso } = await setup();
    const url = await confirmDoseUrl(profileId, iso);
    const token = decodeURIComponent(new URL(url).searchParams.get("token") ?? "");
    signOut();

    const state = await confirmDoseSlot(token, "taken", {}, formData({}));
    expect(state.ok).toBe(true);
    expect(await DoseLog.findOne({ medicationId: medId }).lean()).toMatchObject({
      status: "taken",
      loggedBy: null,
      loggedByName: "Kamala Devi (email link)",
    });
  });

  it("credits a signed-in family member who clicks the link", async () => {
    const { profileId, medId, iso } = await setup();
    const priya = await createUser("Priya Nair");
    await addMember(profileId, priya, "caretaker");
    await signInAs(priya);
    const token = decodeURIComponent(new URL(await confirmDoseUrl(profileId, iso)).searchParams.get("token") ?? "");
    await confirmDoseSlot(token, "taken", {}, formData({}));
    expect((await DoseLog.findOne({ medicationId: medId }).lean())?.loggedByName).toBe("Priya Nair");
  });

  it("rejects forged or tampered links", async () => {
    await setup();
    expect((await confirmDoseSlot("forged.token.value", "taken", {}, formData({}))).message).toMatch(/expired/);
    expect(await DoseLog.countDocuments({})).toBe(0);
  });
});
