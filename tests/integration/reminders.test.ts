import { describe, expect, it } from "vitest";
import { acknowledgeAlertAction, acknowledgeFromEmail } from "@/app/actions/alerts";
import { markDose, unmarkDose } from "@/app/actions/doses";
import { doseRef, loadAckLink } from "@/lib/alerts";
import { getDoseItems } from "@/lib/data";
import { toProfileDTO } from "@/lib/dto";
import { Activity, Alert, Appointment, DoseLog, Membership, ReminderLog } from "@/lib/models";
import { runReminders } from "@/lib/reminders";
import { zonedToUtc } from "@/lib/schedule";
import { testState } from "../setup/integration";
import { addMember, createCircle, createMedication, createUser, emailsTo, formData, signInAs } from "./helpers";

// 09:00 in India on Tue 10 Mar 2026. Every run below uses a fixed clock, so these tests are exact.
const NOW = new Date("2026-03-10T03:30:00.000Z");
const minutes = (n: number) => new Date(NOW.getTime() + n * 60_000);
const SINCE = new Date("2026-03-01T00:00:00Z");
const ZONE = "Asia/Kolkata";
const MEDICINE_NAMES = ["Amlodipine", "Vitamin D3", "Calcium", "Atorvastatin", "Metformin"];

async function circle() {
  const rahul = await createUser("Rahul Sharma"); // family, admin, alerts on
  const { profile, profileId } = await createCircle(rahul, { elderEmail: "elder@example.com" });
  const priya = await createUser("Priya Nair"); // caretaker
  const anil = await createUser("Anil Sharma"); // family, alerts off
  await addMember(profileId, priya, "caretaker");
  await addMember(profileId, anil, "family", { emailAlerts: false });
  return { profile, profileId, rahul, priya, anil };
}

const withSubject = (start: string) => testState.outbox.filter((email) => email.subject.startsWith(start));
const recipients = (start: string) => withSubject(start).map((email) => email.to).sort();

function ackToken(text: string): string {
  const match = text.match(/\/alerts\/ack\?token=([^\s]+)/);
  if (!match) throw new Error("No acknowledge link in the email");
  return decodeURIComponent(match[1]);
}

describe("reminder engine", () => {
  it("sends each stage to the right people, exactly once", async () => {
    const { profileId, rahul, priya, anil } = await circle();
    const base = { startDate: "2026-03-01", scheduleChangedAt: SINCE };
    await createMedication(profileId, { ...base, name: "Amlodipine", dosage: "5 mg", times: ["09:03"] }); // due in 3 min
    await createMedication(profileId, { ...base, name: "Vitamin D3", dosage: "", times: ["08:40"] }); // 20 min late
    await createMedication(profileId, { ...base, name: "Calcium", dosage: "500 mg", times: ["08:40"], stock: 2, refillThreshold: 5 });
    await createMedication(profileId, { ...base, name: "Atorvastatin", dosage: "10 mg", times: ["08:20"] }); // 40 min late
    const metformin = await createMedication(profileId, { ...base, name: "Metformin", times: ["07:45"] });
    await DoseLog.create({
      profileId,
      medicationId: metformin._id,
      scheduledFor: zonedToUtc("2026-03-10", "07:45", ZONE),
      localDate: "2026-03-10",
      localTime: "07:45",
      status: "taken",
    });
    await Appointment.create({ profileId, doctorName: "Dr. Mehta", dateTime: minutes(90) });
    await Appointment.create({ profileId, doctorName: "Dr. Rao", dateTime: minutes(20 * 60) });
    await Appointment.create({ profileId, doctorName: "Dr. Later", dateTime: minutes(30 * 60) });

    const summary = await runReminders(NOW);
    expect(summary).toMatchObject({
      profiles: 1,
      upcoming: 1,
      followUps: 1,
      escalated: 1,
      widened: 0,
      appointments: 2,
      lowStock: 1,
      errors: 0,
    });
    expect(summary.emails).toBe(15);

    // 1. Dose reminder: the elder and caretakers.
    expect(recipients("Medicine reminder for Kamala Devi · 9:03 AM")).toEqual(["elder@example.com", priya.email].sort());
    // 2. Follow-up for the still-pending 8:40 slot, listing every medicine in it.
    const followUps = withSubject("Still pending: Kamala Devi’s 8:40 AM medicines");
    expect(followUps.map((email) => email.to).sort()).toEqual(["elder@example.com", priya.email].sort());
    expect(followUps[0].text).toContain("Vitamin D3");
    expect(followUps[0].text).toContain("Calcium 500 mg");
    // 3. Escalation: nobody is responsible for Atorvastatin, so every caretaker and family member with
    //    alerts on is asked, each with their own "I'm on it" link. Never people who turned alerts off.
    const alerts = withSubject("Action needed: Kamala Devi’s 8:20 AM medicines are unconfirmed");
    expect(alerts.map((email) => email.to).sort()).toEqual([priya.email, rahul.email].sort());
    expect(new Set(alerts.map((email) => ackToken(email.text))).size).toBe(2);
    expect(emailsTo(anil.email)).toHaveLength(0);

    // Appointment reminders: 2-hour and 24-hour windows only.
    expect(withSubject("Soon: Kamala Devi’s doctor appointment")).toHaveLength(3);
    expect(withSubject("Reminder: Kamala Devi’s doctor appointment")).toHaveLength(3);
    expect(testState.outbox.some((email) => email.text.includes("Dr. Later"))).toBe(false);
    expect(withSubject("Refill needed for Kamala Devi’s medicines")).toHaveLength(3);

    // Medicine names never appear in a subject line.
    for (const email of testState.outbox) {
      for (const name of MEDICINE_NAMES) expect(email.subject).not.toContain(name);
    }

    // The escalated dose is recorded as unconfirmed (never as taken), and so are yesterday's doses (silently).
    const atorvastatinToday = await DoseLog.findOne({ localDate: "2026-03-10", localTime: "08:20" }).lean();
    expect(atorvastatinToday?.status).toBe("unconfirmed");
    expect(await DoseLog.countDocuments({ localDate: "2026-03-09", status: "unconfirmed" })).toBe(5);
    expect(await DoseLog.countDocuments({ status: "taken" })).toBe(1); // only the one a person recorded

    const alert = await Alert.findOne({ profileId }).lean();
    expect(alert).toMatchObject({ localTime: "08:20", status: "open", notifiedNames: ["Priya Nair", "Rahul Sharma"] });
    expect(await Alert.countDocuments()).toBe(1);

    // Every stage is in the timeline.
    expect(await Activity.countDocuments({ profileId, kind: "reminder" })).toBe(4); // dose, follow-up, 2 visits
    expect(await Activity.countDocuments({ profileId, kind: "alert" })).toBe(1);

    // A second run at the same moment sends nothing new.
    testState.outbox.length = 0;
    const again = await runReminders(NOW);
    expect(again).toMatchObject({ upcoming: 0, followUps: 0, escalated: 0, widened: 0, appointments: 0, lowStock: 0, emails: 0 });
    expect(testState.outbox).toHaveLength(0);
  });

  it("takes one dose through reminder, follow-up, escalation and a single widening", async () => {
    const { profile, profileId, rahul, priya } = await circle();
    const med = await createMedication(profileId, {
      name: "Amlodipine",
      times: ["09:10"],
      startDate: "2026-03-10",
      scheduleChangedAt: SINCE,
      assigneeId: priya._id,
    });
    const slot = zonedToUtc("2026-03-10", "09:10", ZONE);

    expect((await runReminders(minutes(5))).upcoming).toBe(1); // 5 min before: "medicine time"
    expect(await runReminders(minutes(20))).toMatchObject({ upcoming: 0, followUps: 0, escalated: 0 }); // 10 min late
    expect((await runReminders(minutes(25))).followUps).toBe(1); // 15 min late: follow-up

    testState.outbox.length = 0;
    expect((await runReminders(minutes(40))).escalated).toBe(1); // 30 min late: the responsible caretaker only
    expect(recipients("Action needed")).toEqual([priya.email]);
    const alert = await Alert.findOne({ profileId }).lean();
    expect(alert?.reminderSentAt).toBeTruthy();
    expect(alert?.followUpSentAt).toBeTruthy();
    expect(alert?.notifiedNames).toEqual(["Priya Nair"]);

    expect((await runReminders(minutes(50))).widened).toBe(0); // 10 min after the alert: still waiting
    testState.outbox.length = 0;
    expect((await runReminders(minutes(55))).widened).toBe(1); // 15 min without a response: everyone else
    expect(recipients("Still no response: Kamala Devi’s 9:10 AM medicines")).toEqual([rahul.email]);

    // Nothing loops afterwards.
    expect(await runReminders(minutes(80))).toMatchObject({ upcoming: 0, followUps: 0, escalated: 0, widened: 0, emails: 0 });

    // The dose is unconfirmed, never assumed taken.
    const [dose] = await getDoseItems(toProfileDTO(profile), ["2026-03-10"], minutes(80));
    expect(dose).toMatchObject({ medicationId: med._id.toString(), status: "unconfirmed" });
    expect(dose.alert?.status).toBe("open");
    expect(await DoseLog.countDocuments({ status: "taken" })).toBe(0);

    // The timeline holds the whole sequence for this dose.
    const steps = await Activity.find({ profileId, refId: doseRef(slot) }).sort({ createdAt: 1, _id: 1 }).lean();
    expect(steps.map((step) => [step.kind, step.status])).toEqual([
      ["reminder", "pending"],
      ["reminder", "pending"],
      ["alert", "unconfirmed"],
      ["alert", "open"],
    ]);
  });

  it("stops widening once someone acknowledges, and closes the alert when the dose is recorded", async () => {
    const { profileId, priya } = await circle();
    const med = await createMedication(profileId, {
      name: "Amlodipine",
      times: ["09:10"],
      startDate: "2026-03-10",
      scheduleChangedAt: SINCE,
      assigneeId: priya._id,
    });
    const slot = zonedToUtc("2026-03-10", "09:10", ZONE).toISOString();
    await runReminders(minutes(40));

    // Priya taps "I'm on it" in her email, without logging in.
    const token = ackToken(withSubject("Action needed")[0].text);
    expect((await loadAckLink(token))?.user.name).toBe("Priya Nair");
    expect(await acknowledgeFromEmail(token, {}, formData({}))).toMatchObject({ ok: true, message: expect.stringMatching(/Thank you/) });
    expect(await Alert.findOne({ profileId }).lean()).toMatchObject({ status: "acknowledged", acknowledgedByName: "Priya Nair" });
    expect((await acknowledgeFromEmail(token, {}, formData({}))).message).toBe("Priya Nair is already following up.");

    expect((await runReminders(minutes(60))).widened).toBe(0);

    // After checking in, she records the dose: the alert resolves itself.
    await signInAs(priya);
    expect((await markDose(profileId, med._id.toString(), slot, "taken", {}, formData({}))).ok).toBe(true);
    expect(await DoseLog.findOne({ medicationId: med._id }).lean()).toMatchObject({ status: "taken", loggedByName: "Priya Nair" });
    expect(await Alert.findOne({ profileId }).lean()).toMatchObject({ status: "resolved", resolution: "taken", resolvedByName: "Priya Nair" });

    // Undoing it opens the alert again (still with Priya following up).
    expect((await unmarkDose(profileId, med._id.toString(), slot, {}, formData({}))).ok).toBe(true);
    expect((await Alert.findOne({ profileId }).lean())?.status).toBe("acknowledged");

    const kinds = (await Activity.find({ profileId, refId: doseRef(slot) }).sort({ createdAt: 1, _id: 1 }).lean()).map((a) => a.kind);
    expect(kinds).toEqual(["alert", "acknowledgement", "dose", "alert", "dose", "alert"]);
  });

  it("only lets current members acknowledge", async () => {
    const { profileId, rahul, anil } = await circle();
    await createMedication(profileId, { name: "Amlodipine", times: ["08:20"], startDate: "2026-03-10", scheduleChangedAt: SINCE });
    await runReminders(NOW);
    const alert = await Alert.findOne({ profileId }).lean();
    const rahulsLink = ackToken(emailsTo(rahul.email).find((email) => email.subject.startsWith("Action needed"))!.text);

    // A forged link, or the link of someone who has left the circle, does nothing.
    expect((await acknowledgeFromEmail("not-a-token", {}, formData({}))).message).toMatch(/expired/);
    await Membership.deleteOne({ profileId, userId: rahul._id });
    expect(await loadAckLink(rahulsLink)).toBeNull();
    expect((await acknowledgeFromEmail(rahulsLink, {}, formData({}))).message).toMatch(/expired/);

    // Strangers can't acknowledge in the app either.
    const stranger = await createUser("Stranger");
    await signInAs(stranger);
    expect((await acknowledgeAlertAction(profileId, alert!._id.toString(), {}, formData({}))).message).toMatch(/don’t have access/);
    expect((await Alert.findById(alert!._id).lean())?.status).toBe("open");

    // Any member, even with emails off, can.
    await signInAs(anil);
    expect((await acknowledgeAlertAction(profileId, alert!._id.toString(), {}, formData({}))).ok).toBe(true);
    expect((await Alert.findById(alert!._id).lean())?.acknowledgedByName).toBe("Anil Sharma");
  });

  it("alerts the whole circle when the responsible person has email alerts off", async () => {
    const { profileId, rahul, priya, anil } = await circle();
    await createMedication(profileId, {
      name: "Amlodipine",
      times: ["08:20"],
      startDate: "2026-03-10",
      scheduleChangedAt: SINCE,
      assigneeId: anil._id,
    });
    expect((await runReminders(NOW)).escalated).toBe(1);
    expect(recipients("Action needed")).toEqual([priya.email, rahul.email].sort());
  });

  it("doesn't follow up or alert when the dose was marked taken", async () => {
    const { profileId } = await circle();
    const med = await createMedication(profileId, { name: "Amlodipine", times: ["08:00"], startDate: "2026-03-10", scheduleChangedAt: SINCE });
    await DoseLog.create({
      profileId,
      medicationId: med._id,
      scheduledFor: zonedToUtc("2026-03-10", "08:00", ZONE),
      localDate: "2026-03-10",
      localTime: "08:00",
      status: "taken",
    });
    const summary = await runReminders(minutes(30)); // 90 min after the dose
    expect(summary).toMatchObject({ followUps: 0, escalated: 0, emails: 0 });
    expect(await Alert.countDocuments()).toBe(0);
  });

  it("ignores doses scheduled before a medicine was added", async () => {
    const { profileId } = await circle();
    // Added at 08:55, so today's 07:30 dose was never expected.
    await createMedication(profileId, { times: ["07:30"], startDate: "2026-03-10", scheduleChangedAt: minutes(-5) });
    expect(await runReminders(NOW)).toMatchObject({ followUps: 0, escalated: 0, emails: 0 });
  });

  it("uses each elder's own timezone", async () => {
    const owner = await createUser("Maya");
    const { profileId } = await createCircle(owner, { timezone: "America/New_York", elderEmail: "ny@example.com" });
    // 08:00 in New York on 10 Mar 2026 (daylight saving time) is 12:00 UTC.
    await createMedication(profileId, { times: ["08:00"], startDate: "2026-03-01", scheduleChangedAt: SINCE });
    const summary = await runReminders(new Date("2026-03-10T11:57:00.000Z"));
    expect(summary.upcoming).toBe(1);
    expect(emailsTo("ny@example.com")[0].subject).toBe("Medicine reminder for Kamala Devi · 8:00 AM");
  });

  it("emails last week's summary to the circle once, on Monday morning", async () => {
    const { profileId, rahul, priya } = await circle();
    const med = await createMedication(profileId, { name: "Amlodipine", times: ["08:00"], startDate: "2026-03-02", scheduleChangedAt: SINCE });
    // Last week (Mon 9 – Sun 15 Mar): three doses taken, the other four never confirmed.
    for (const date of ["2026-03-09", "2026-03-10", "2026-03-11"]) {
      await DoseLog.create({
        profileId,
        medicationId: med._id,
        scheduledFor: zonedToUtc(date, "08:00", ZONE),
        localDate: date,
        localTime: "08:00",
        status: "taken",
      });
    }
    // Sunday 15 Mar 10:00 in India: too early. Monday 16 Mar 06:30: still too early. 08:00: sent.
    expect((await runReminders(new Date("2026-03-15T04:30:00.000Z"))).weekly).toBe(0);
    expect((await runReminders(new Date("2026-03-16T01:00:00.000Z"))).weekly).toBe(0);
    testState.outbox.length = 0;
    expect((await runReminders(new Date("2026-03-16T02:30:00.000Z"))).weekly).toBe(1);
    const weekly = withSubject("Kamala Devi’s weekly care summary");
    expect(weekly.map((email) => email.to).sort()).toEqual(["elder@example.com", priya.email, rahul.email].sort());
    expect(weekly[0].subject).not.toContain("Amlodipine");
    expect(weekly[0].text).toContain("Taken: 3");
    expect(weekly[0].text).toContain("Unconfirmed (nobody recorded it in time): 4");
    expect((await runReminders(new Date("2026-03-16T05:30:00.000Z"))).weekly).toBe(0); // once per week
  });

  it("retries a reminder on the next run when every email failed", async () => {
    const { profileId } = await circle();
    await createMedication(profileId, { name: "Amlodipine", times: ["09:03"], startDate: "2026-03-10", scheduleChangedAt: SINCE });

    testState.failEmails = true;
    expect((await runReminders(NOW)).upcoming).toBe(0);
    expect(await ReminderLog.countDocuments({ kind: "dose-upcoming" })).toBe(0);

    testState.failEmails = false;
    expect((await runReminders(NOW)).upcoming).toBe(1);
  });
});
