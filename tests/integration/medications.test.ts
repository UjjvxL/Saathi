import { describe, expect, it } from "vitest";
import {
  addScannedMedications,
  addStock,
  createMedication as createMedicationAction,
  deleteMedication,
  setMedicationActive,
  updateMedication,
} from "@/app/actions/medications";
import { Activity, DoseLog, Medication } from "@/lib/models";
import { todayInZone } from "@/lib/schedule";
import { createCircle, createMedication, createUser, expectRedirect, formData, signInAs } from "./helpers";

const validFields = {
  name: "Amlodipine",
  dosage: "5 mg",
  form: "tablet",
  instructions: "With water",
  times: ["20:00", "08:00"],
  frequency: "daily",
  startDate: "2026-01-01",
  endDate: "",
  stock: "30",
  unitsPerDose: "1",
  refillThreshold: "5",
};

async function signedInCircle() {
  const owner = await createUser("Rahul");
  const circle = await createCircle(owner);
  await signInAs(owner);
  return { owner, ...circle };
}

describe("adding medicines", () => {
  it("validates the form", async () => {
    const { profileId } = await signedInCircle();
    const state = await createMedicationAction(profileId, {}, formData({ ...validFields, name: "", times: [] }));
    expect(state.errors?.name).toBeTruthy();
    expect(state.errors?.times).toEqual(["Add at least one time"]);
    expect(await Medication.countDocuments({ profileId })).toBe(0);
  });

  it("requires weekdays for 'only on some days'", async () => {
    const { profileId } = await signedInCircle();
    const state = await createMedicationAction(profileId, {}, formData({ ...validFields, frequency: "specific_days" }));
    expect(state.errors?.daysOfWeek).toEqual(["Pick at least one day"]);
  });

  it("saves a valid medicine and records who added it", async () => {
    const { profileId, owner } = await signedInCircle();
    const before = Date.now();
    const target = await expectRedirect(() =>
      createMedicationAction(profileId, {}, formData({ ...validFields, frequency: "specific_days", daysOfWeek: ["5", "1"] })),
    );
    expect(target).toBe(`/p/${profileId}/medications`);

    const med = await Medication.findOne({ profileId }).lean();
    expect(med).toMatchObject({ name: "Amlodipine", times: ["08:00", "20:00"], daysOfWeek: [1, 5], stock: 30, refillThreshold: 5 });
    expect(med?.createdBy?.toString()).toBe(owner._id.toString());
    expect(med?.scheduleChangedAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect((await Activity.findOne({ profileId, kind: "medication" }).lean())?.message).toBe(
      "Rahul added Amlodipine 5 mg (Mon, Fri · 8:00 AM, 8:00 PM)",
    );
  });

  it("refuses people outside the care circle", async () => {
    const { profileId } = await signedInCircle();
    await signInAs(await createUser("Stranger"));
    const state = await createMedicationAction(profileId, {}, formData(validFields));
    expect(state.message).toMatch(/don’t have access/);
  });
});

describe("changing medicines", () => {
  it("only restarts the expected-dose clock when the schedule itself changes", async () => {
    const { profileId } = await signedInCircle();
    const med = await createMedication(profileId, { times: ["08:00", "20:00"] });
    const original = med.scheduleChangedAt.getTime();

    await expectRedirect(() =>
      updateMedication(profileId, med._id.toString(), {}, formData({ ...validFields, name: "Metformin", times: ["08:00", "20:00"], startDate: "2020-01-01" })),
    );
    expect((await Medication.findById(med._id).lean())?.scheduleChangedAt.getTime()).toBe(original);

    await expectRedirect(() =>
      updateMedication(profileId, med._id.toString(), {}, formData({ ...validFields, times: ["09:00"], startDate: "2020-01-01" })),
    );
    const updated = await Medication.findById(med._id).lean();
    expect(updated?.times).toEqual(["09:00"]);
    expect(updated?.scheduleChangedAt.getTime()).toBeGreaterThan(original);
  });

  it("stops and restarts a medicine without losing history", async () => {
    const { profileId, profile } = await signedInCircle();
    const med = await createMedication(profileId);
    await setMedicationActive(profileId, med._id.toString(), false, {}, formData({}));
    const stopped = await Medication.findById(med._id).lean();
    expect(stopped).toMatchObject({ active: false, endDate: todayInZone(profile.timezone) });

    await setMedicationActive(profileId, med._id.toString(), true, {}, formData({}));
    expect((await Medication.findById(med._id).lean())?.active).toBe(true);
  });

  it("adds refilled stock", async () => {
    const { profileId } = await signedInCircle();
    const tracked = await createMedication(profileId, { stock: 4 });
    const untracked = await createMedication(profileId, { name: "Vitamin D3", stock: null });

    expect((await addStock(profileId, tracked._id.toString(), {}, formData({ amount: "30" }))).message).toBe("Stock is now 34.");
    expect((await addStock(profileId, untracked._id.toString(), {}, formData({ amount: "10" }))).message).toBe("Stock is now 10.");
    expect((await addStock(profileId, tracked._id.toString(), {}, formData({ amount: "-3" }))).errors?.amount).toBeTruthy();
  });

  it("deletes a medicine together with its dose history", async () => {
    const { profileId } = await signedInCircle();
    const med = await createMedication(profileId);
    await DoseLog.create({
      profileId,
      medicationId: med._id,
      scheduledFor: new Date("2026-01-01T02:30:00Z"),
      localDate: "2026-01-01",
      localTime: "08:00",
      status: "taken",
    });
    await expectRedirect(() => deleteMedication(profileId, med._id.toString(), {}, formData({})));
    expect(await Medication.exists({ _id: med._id })).toBeNull();
    expect(await DoseLog.countDocuments({ medicationId: med._id })).toBe(0);
  });
});

describe("medicines from a scanned prescription", () => {
  it("saves the reviewed list, turning a course length into an end date", async () => {
    const { profileId, profile } = await signedInCircle();
    const payload = [
      { name: "Paracetamol", dosage: "500 mg", form: "tablet", times: ["08:00", "20:00"], instructions: "After food", durationDays: 5 },
      { name: "Telmisartan", dosage: "40 mg", form: "tablet", times: ["08:00"], instructions: "", durationDays: null },
    ];
    await expectRedirect(() => addScannedMedications(profileId, {}, formData({ payload: JSON.stringify(payload) })));

    const meds = await Medication.find({ profileId }).sort({ name: 1 }).lean();
    expect(meds.map((m) => m.name)).toEqual(["Paracetamol", "Telmisartan"]);
    const today = todayInZone(profile.timezone);
    expect(meds[0].startDate).toBe(today);
    expect(meds[0].endDate).not.toBeNull();
    expect(meds[1].endDate).toBeNull();
  });

  it("rejects empty or broken lists", async () => {
    const { profileId } = await signedInCircle();
    expect((await addScannedMedications(profileId, {}, formData({ payload: "not json" }))).message).toMatch(/scan again/);
    expect((await addScannedMedications(profileId, {}, formData({ payload: "[]" }))).message).toMatch(/at least one/);
    const badTime = JSON.stringify([{ name: "X", dosage: "", form: "tablet", times: ["99:99"], instructions: "", durationDays: null }]);
    expect((await addScannedMedications(profileId, {}, formData({ payload: badTime }))).message).toMatch(/Please check “X”/);
  });
});
