import { describe, expect, it } from "vitest";
import { createAppointment, setAppointmentStatus, updateAppointment } from "@/app/actions/appointments";
import { markDose } from "@/app/actions/doses";
import { createMedication as createMedicationAction } from "@/app/actions/medications";
import { joinProfile, regeneratePasscode, revokeInvitations } from "@/app/actions/profiles";
import { logActivity } from "@/lib/activity";
import { getCareCircleOverview, getTimeline } from "@/lib/data";
import { toProfileDTO } from "@/lib/dto";
import { Activity, Alert, Appointment, DoseLog, Medication, Profile } from "@/lib/models";
import { zonedToUtc } from "@/lib/schedule";
import {
  addMember,
  createCircle,
  createMedication,
  createUser,
  expectRedirect,
  formData,
  signInAs,
} from "./helpers";

const ZONE = "Asia/Kolkata";

async function circle() {
  const rahul = await createUser("Rahul Sharma"); // family, admin (created the circle)
  const { profile, profileId, passcode } = await createCircle(rahul);
  const priya = await createUser("Priya Nair");
  const anil = await createUser("Anil Sharma");
  await addMember(profileId, priya, "caretaker");
  await addMember(profileId, anil, "family");
  return { profile, profileId, passcode, rahul, priya, anil };
}

function medicineForm(overrides: Record<string, string | string[]> = {}) {
  return formData({
    name: "Amlodipine",
    dosage: "5 mg",
    form: "tablet",
    instructions: "",
    frequency: "daily",
    startDate: "2026-03-01",
    endDate: "",
    stock: "",
    unitsPerDose: "1",
    refillThreshold: "",
    times: ["09:00"],
    assigneeId: "",
    ...overrides,
  });
}

function appointmentForm(overrides: Record<string, string> = {}) {
  return formData({
    doctorName: "Dr. Mehta",
    specialty: "Cardiologist",
    location: "City Hospital",
    date: "2030-01-15",
    time: "10:30",
    notes: "",
    assigneeId: "",
    ...overrides,
  });
}

describe("role-based permissions", () => {
  it("lets caretakers and admins change medicines, but not family members", async () => {
    const { profileId, rahul, priya, anil } = await circle();

    await signInAs(anil);
    expect(await createMedicationAction(profileId, {}, medicineForm())).toEqual({
      message: "Only caretakers and admins can change medicine schedules.",
    });
    expect(await Medication.countDocuments()).toBe(0);

    await signInAs(priya);
    const target = await expectRedirect(() =>
      createMedicationAction(profileId, {}, medicineForm({ assigneeId: rahul._id.toString() })),
    );
    expect(target).toBe(`/p/${profileId}/medications`);
    const med = await Medication.findOne({ profileId }).lean();
    expect(med?.assigneeId?.toString()).toBe(rahul._id.toString());
    expect(await Activity.findOne({ profileId, kind: "responsibility" }).lean()).toMatchObject({
      message: "Priya Nair made Rahul Sharma responsible for Amlodipine 5 mg",
      status: "assigned",
    });
  });

  it("only assigns people who are in the care circle", async () => {
    const { profileId, priya } = await circle();
    const outsider = await createUser("Outsider");
    await signInAs(priya);
    const result = await createMedicationAction(profileId, {}, medicineForm({ assigneeId: outsider._id.toString() }));
    expect(result.errors?.assigneeId).toEqual(["That person isn’t in this care circle."]);
    const garbage = await createMedicationAction(profileId, {}, medicineForm({ assigneeId: "not-an-id" }));
    expect(garbage.errors?.assigneeId).toBeTruthy();
    expect(await Medication.countDocuments()).toBe(0);
  });

  it("lets family add appointments and confirm doses, but not assign or manage the circle", async () => {
    const { profileId, priya, anil } = await circle();
    await signInAs(anil);
    expect((await createAppointment(profileId, {}, appointmentForm())).ok).toBe(true);
    const assign = await createAppointment(profileId, {}, appointmentForm({ assigneeId: priya._id.toString() }));
    expect(assign.errors?.assigneeId).toEqual(["Only caretakers and admins can assign responsibilities."]);

    // Family can record doses: the permission check passes, and the dose itself is rejected only for its age.
    const med = await createMedication(profileId, { times: ["08:00"], scheduleChangedAt: new Date("2026-03-01T00:00:00Z") });
    expect((await markDose(profileId, med._id.toString(), "2026-03-02T02:30:00.000Z", "skipped", {}, formData({}))).message).toBe(
      "This dose is too old to change.",
    );

    await signInAs(priya);
    expect((await regeneratePasscode(profileId, {}, formData({}))).message).toBe("Only care-circle admins can do this.");
  });

  it("keeps strangers out of every action", async () => {
    const { profileId } = await circle();
    const stranger = await createUser("Stranger");
    await signInAs(stranger);
    expect((await createAppointment(profileId, {}, appointmentForm())).message).toBe("You don’t have access to this care profile.");
    expect(await createMedicationAction(profileId, {}, medicineForm())).toEqual({ message: "You don’t have access to this care profile." });
    expect(await Appointment.countDocuments()).toBe(0);
  });
});

describe("appointment responsibilities", () => {
  it("records who is responsible and who completed the visit", async () => {
    const { profileId, rahul, priya } = await circle();
    await signInAs(priya);
    await createAppointment(profileId, {}, appointmentForm());
    const appointment = await Appointment.findOne({ profileId }).lean();
    const id = appointment!._id.toString();

    await expectRedirect(() => updateAppointment(profileId, id, {}, appointmentForm({ assigneeId: rahul._id.toString(), time: "11:00" })));
    const updated = await Appointment.findById(id).lean();
    expect(updated?.assigneeId?.toString()).toBe(rahul._id.toString());
    expect(updated?.dateTime.toISOString()).toBe(zonedToUtc("2030-01-15", "11:00", ZONE).toISOString());

    await signInAs(rahul);
    expect((await setAppointmentStatus(profileId, id, "completed", {}, formData({}))).ok).toBe(true);
    expect(await Appointment.findById(id).lean()).toMatchObject({ status: "completed", statusChangedByName: "Rahul Sharma" });
    const done = await Activity.findOne({ profileId, kind: "responsibility", status: "completed" }).lean();
    expect(done?.message).toBe("Rahul Sharma marked as done the appointment with Dr. Mehta");
  });
});

describe("invitations", () => {
  it("rejects an expired passcode without revealing whether a wrong one was close", async () => {
    const { profile, profileId, passcode } = await circle();
    await Profile.updateOne({ _id: profileId }, { $set: { passcodeExpiresAt: new Date(Date.now() - 1000) } });
    const joiner = await createUser("Late Joiner");
    await signInAs(joiner);

    const expired = await joinProfile({}, formData({ careId: profile.careId, passcode, relationship: "family" }));
    expect(expired.message).toBe("This passcode has expired. Ask an admin of the care circle to generate a new one.");
    const wrong = await joinProfile({}, formData({ careId: profile.careId, passcode: "000000", relationship: "family" }));
    expect(wrong.message).toBe("That Care ID and passcode don’t match. Check with the person who shared them.");
  });

  it("lets admins turn invitations off and issue a fresh 7-day passcode", async () => {
    const { profileId, rahul, priya } = await circle();
    await signInAs(priya);
    expect((await revokeInvitations(profileId, {}, formData({}))).message).toBe("Only care-circle admins can do this.");

    await signInAs(rahul);
    expect((await revokeInvitations(profileId, {}, formData({}))).ok).toBe(true);
    const revoked = await Profile.findById(profileId).lean();
    expect(revoked!.passcodeExpiresAt!.getTime()).toBeLessThanOrEqual(Date.now());

    const fresh = await regeneratePasscode(profileId, {}, formData({}));
    expect(fresh.passcode).toMatch(/^\d{6}$/);
    const renewed = await Profile.findById(profileId).lean();
    const days = (renewed!.passcodeExpiresAt!.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThanOrEqual(7);
  });

  it("gives older profiles without an expiry a 7-day window from when the passcode was set", () => {
    const setAt = new Date("2026-01-01T00:00:00Z");
    const dto = toProfileDTO({ _id: "p1", name: "K", careId: "ABCDEF", timezone: ZONE, passcodeUpdatedAt: setAt });
    expect(dto.passcodeExpiresAt).toBe("2026-01-08T00:00:00.000Z");
  });
});

describe("care circle overview", () => {
  it("shows who is responsible for what, what's pending and what was done", async () => {
    const { profile, profileId, rahul, priya } = await circle();
    // 14:00 in India on 10 Mar 2026.
    const now = new Date("2026-03-10T08:30:00.000Z");
    const since = new Date("2026-03-01T00:00:00Z");
    const assigned = await createMedication(profileId, {
      name: "Amlodipine",
      dosage: "5 mg",
      times: ["08:00", "20:00"],
      scheduleChangedAt: since,
      assigneeId: priya._id,
    });
    await createMedication(profileId, { name: "Vitamin D3", dosage: "", times: ["09:00"], scheduleChangedAt: since });
    await DoseLog.create({
      profileId,
      medicationId: assigned._id,
      scheduledFor: zonedToUtc("2026-03-10", "08:00", ZONE),
      localDate: "2026-03-10",
      localTime: "08:00",
      status: "taken",
      loggedByName: "Priya Nair",
      takenAt: zonedToUtc("2026-03-10", "08:10", ZONE),
    });
    await Appointment.create({ profileId, doctorName: "Dr. Rao", dateTime: new Date(now.getTime() + 86_400_000), assigneeId: rahul._id });
    await Alert.create({
      profileId,
      slot: zonedToUtc("2026-03-10", "09:00", ZONE),
      localDate: "2026-03-10",
      localTime: "09:00",
      medicines: ["Vitamin D3"],
      status: "acknowledged",
      escalatedAt: zonedToUtc("2026-03-10", "09:30", ZONE),
      acknowledgedAt: zonedToUtc("2026-03-10", "09:42", ZONE),
      acknowledgedByName: "Rahul Sharma",
    });

    const overview = await getCareCircleOverview(toProfileDTO(profile), now);
    expect(overview.pending.map((item) => [item.title, item.status, item.assigneeName])).toEqual([
      ["Amlodipine 5 mg", "upcoming", "Priya Nair"],
      ["Visit to Dr. Rao", "scheduled", "Rahul Sharma"],
    ]);
    // Newest first (the dose log was written just now, after the alert's acknowledgement).
    expect(overview.completed.map((item) => [item.kind, item.title, item.doneByName])).toEqual([
      ["dose", "Amlodipine 5 mg", "Priya Nair"],
      ["alert", "Follow-up on the 9:00 AM alert", "Rahul Sharma"],
    ]);
    expect(overview.openAlerts.map((alert) => alert.status)).toEqual(["acknowledged"]);
    expect(overview.unassignedMedicines.map((med) => med.name)).toEqual(["Vitamin D3"]);
    expect(overview.assignments[priya._id.toString()]).toEqual(["Amlodipine 5 mg"]);
    expect(overview.assignments[rahul._id.toString()]).toEqual(["Visit to Dr. Rao"]);
  });
});

describe("timeline", () => {
  it("filters events by date, type and member", async () => {
    const { profile, profileId, rahul, priya } = await circle();
    const dto = toProfileDTO(profile);
    await logActivity({ profileId, actorName: "Saathi", kind: "reminder", message: "Reminder sent to Priya", involvedUserIds: [priya._id.toString()] });
    await logActivity({ profileId, actorName: "Saathi", kind: "alert", message: "Priya was alerted", involvedUserIds: [priya._id.toString()] });
    await logActivity({ profileId, actorId: priya._id.toString(), actorName: "Priya Nair", kind: "acknowledgement", message: "Priya acknowledged" });
    await logActivity({ profileId, actorId: rahul._id.toString(), actorName: "Rahul Sharma", kind: "medication", message: "Rahul added a medicine" });
    await Activity.create({ profileId, actorName: "Saathi", kind: "reminder", message: "Old reminder", createdAt: new Date("2020-01-01T00:00:00Z") });

    const today = new Date().toLocaleDateString("en-CA", { timeZone: ZONE });
    const all = await getTimeline(dto, { from: today, to: today, kind: null, member: null });
    expect(all.entries).toHaveLength(4);
    expect(all.entries[0].message).toBe("Rahul added a medicine"); // newest first

    const alerts = await getTimeline(dto, { from: today, to: today, kind: "alert", member: null });
    expect(alerts.entries.map((entry) => entry.message)).toEqual(["Priya was alerted"]);

    const priyas = await getTimeline(dto, { from: today, to: today, kind: null, member: priya._id.toString() });
    expect(priyas.entries.map((entry) => entry.message).sort()).toEqual(["Priya acknowledged", "Priya was alerted", "Reminder sent to Priya"]);

    const automatic = await getTimeline(dto, { from: today, to: today, kind: null, member: "saathi" });
    expect(automatic.entries.map((entry) => entry.message).sort()).toEqual(["Priya was alerted", "Reminder sent to Priya"]);

    const old = await getTimeline(dto, { from: "2019-12-31", to: "2020-01-02", kind: null, member: null });
    expect(old.entries.map((entry) => entry.message)).toEqual(["Old reminder"]);
  });
});
