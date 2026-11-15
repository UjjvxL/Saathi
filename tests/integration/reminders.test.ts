import { describe, expect, it } from "vitest";
import { Activity, Appointment, DoseLog, ReminderLog } from "@/lib/models";
import { runReminders } from "@/lib/reminders";
import { zonedToUtc } from "@/lib/schedule";
import { testState } from "../setup/integration";
import { addMember, createCircle, createMedication, createUser, emailsTo } from "./helpers";

// 09:00 in India on Tue 10 Mar 2026. Every run below uses a fixed clock, so these tests are exact.
const NOW = new Date("2026-03-10T03:30:00.000Z");
const minutes = (n: number) => new Date(NOW.getTime() + n * 60_000);
const SINCE = new Date("2026-03-01T00:00:00Z");

async function circle() {
  const rahul = await createUser("Rahul Sharma"); // family, admin, alerts on
  const { profile, profileId } = await createCircle(rahul, { elderEmail: "elder@example.com" });
  const priya = await createUser("Priya Nair"); // caretaker
  const anil = await createUser("Anil Sharma"); // family, alerts off
  await addMember(profileId, priya, "caretaker");
  await addMember(profileId, anil, "family", { emailAlerts: false });
  return { profile, profileId, rahul, priya, anil };
}

describe("reminder engine", () => {
  it("sends the right reminders to the right people, exactly once", async () => {
    const { profileId, rahul, priya, anil } = await circle();
    const base = { startDate: "2026-03-01", scheduleChangedAt: SINCE };
    await createMedication(profileId, { ...base, name: "Amlodipine", dosage: "5 mg", times: ["09:10"] }); // in 10 min
    await createMedication(profileId, { ...base, name: "Vitamin D3", dosage: "", times: ["08:20"] }); // 40 min late
    await createMedication(profileId, { ...base, name: "Calcium", dosage: "500 mg", times: ["08:20"], stock: 2, refillThreshold: 5 });
    await createMedication(profileId, { ...base, name: "Atorvastatin", dosage: "10 mg", times: ["07:30"] }); // 90 min late
    const metformin = await createMedication(profileId, { ...base, name: "Metformin", times: ["07:45"] });
    await DoseLog.create({
      profileId,
      medicationId: metformin._id,
      scheduledFor: zonedToUtc("2026-03-10", "07:45", "Asia/Kolkata"),
      localDate: "2026-03-10",
      localTime: "07:45",
      status: "taken",
    });
    await Appointment.create({ profileId, doctorName: "Dr. Mehta", dateTime: minutes(90) });
    await Appointment.create({ profileId, doctorName: "Dr. Rao", dateTime: minutes(20 * 60) });
    await Appointment.create({ profileId, doctorName: "Dr. Later", dateTime: minutes(30 * 60) });

    const summary = await runReminders(NOW);
    expect(summary).toMatchObject({ profiles: 1, upcoming: 1, missed: 1, escalated: 1, appointments: 2, lowStock: 1, errors: 0 });
    expect(summary.emails).toBe(15);

    // "Medicine time" goes to the elder and caretakers only.
    const upcoming = testState.outbox.filter((email) => email.subject.startsWith("Medicine time"));
    expect(upcoming.map((email) => email.to).sort()).toEqual(["elder@example.com", priya.email].sort());
    expect(upcoming[0].subject).toBe("Medicine time (9:10 AM): Amlodipine 5 mg (After food)");
    expect(upcoming[0].text).toMatch(/https:\/\/saathi\.test\/confirm\?token=/);

    // One nudge per time slot, listing every medicine in it.
    const nudges = testState.outbox.filter((email) => email.subject === "Did Kamala Devi take the 8:20 AM medicines?");
    expect(nudges.map((email) => email.to).sort()).toEqual(["elder@example.com", priya.email].sort());
    expect(nudges[0].text).toContain("Vitamin D3");
    expect(nudges[0].text).toContain("Calcium 500 mg");

    // Escalation reaches caretakers and family with alerts on, never people who turned them off.
    const alerts = testState.outbox.filter((email) => email.subject === "Missed dose alert: Kamala Devi (7:30 AM)");
    expect(alerts.map((email) => email.to).sort()).toEqual([priya.email, rahul.email].sort());
    expect(emailsTo(anil.email)).toHaveLength(0);

    // Appointment reminders: 2-hour and 24-hour windows only.
    const soon = testState.outbox.filter((email) => email.subject.startsWith("Soon: Kamala Devi’s appointment with Dr. Mehta"));
    const dayBefore = testState.outbox.filter((email) => email.subject.startsWith("Reminder: Kamala Devi’s appointment with Dr. Rao"));
    expect(soon).toHaveLength(3);
    expect(dayBefore).toHaveLength(3);
    expect(testState.outbox.some((email) => email.subject.includes("Dr. Later"))).toBe(false);

    expect(testState.outbox.filter((email) => email.subject.startsWith("Running low: Calcium"))).toHaveLength(3);

    // The escalated dose is recorded as missed (plus yesterday's, recorded silently) and shows in the activity log.
    const atorvastatinToday = await DoseLog.findOne({ localDate: "2026-03-10", localTime: "07:30" }).lean();
    expect(atorvastatinToday?.status).toBe("missed");
    expect(await DoseLog.countDocuments({ localDate: "2026-03-09", status: "missed" })).toBe(5);
    expect(await Activity.countDocuments({ profileId, kind: "alert" })).toBe(1);

    // A second run at the same moment sends nothing new.
    testState.outbox.length = 0;
    const again = await runReminders(NOW);
    expect(again).toMatchObject({ upcoming: 0, missed: 0, escalated: 0, appointments: 0, lowStock: 0, emails: 0 });
    expect(testState.outbox).toHaveLength(0);
  });

  it("follows a dose from reminder to nudge as time passes", async () => {
    const { profileId } = await circle();
    await createMedication(profileId, { name: "Amlodipine", times: ["09:10"], startDate: "2026-03-10", scheduleChangedAt: SINCE });

    expect((await runReminders(minutes(0))).upcoming).toBe(1);
    expect(await runReminders(minutes(25))).toMatchObject({ upcoming: 0, missed: 0 }); // 15 min late: still in grace
    expect(await runReminders(minutes(45))).toMatchObject({ missed: 1, escalated: 0 }); // 35 min late: nudge
    expect(await runReminders(minutes(75))).toMatchObject({ escalated: 1 }); // 65 min late: family alert
  });

  it("doesn't nudge or alert when the dose was marked taken", async () => {
    const { profileId } = await circle();
    const med = await createMedication(profileId, { name: "Amlodipine", times: ["08:00"], startDate: "2026-03-10", scheduleChangedAt: SINCE });
    await DoseLog.create({
      profileId,
      medicationId: med._id,
      scheduledFor: zonedToUtc("2026-03-10", "08:00", "Asia/Kolkata"),
      localDate: "2026-03-10",
      localTime: "08:00",
      status: "taken",
    });
    const summary = await runReminders(minutes(30)); // 90 min after the dose
    expect(summary).toMatchObject({ missed: 0, escalated: 0, emails: 0 });
  });

  it("ignores doses scheduled before a medicine was added", async () => {
    const { profileId } = await circle();
    // Added at 08:55, so today's 07:30 dose was never expected.
    await createMedication(profileId, { times: ["07:30"], startDate: "2026-03-10", scheduleChangedAt: minutes(-5) });
    expect(await runReminders(NOW)).toMatchObject({ missed: 0, escalated: 0, emails: 0 });
  });

  it("uses each elder's own timezone", async () => {
    const owner = await createUser("Maya");
    const { profileId } = await createCircle(owner, { timezone: "America/New_York", elderEmail: "ny@example.com" });
    // 08:00 in New York on 10 Mar 2026 (daylight saving time) is 12:00 UTC.
    await createMedication(profileId, { times: ["08:00"], startDate: "2026-03-01", scheduleChangedAt: SINCE });
    const summary = await runReminders(new Date("2026-03-10T11:52:00.000Z"));
    expect(summary.upcoming).toBe(1);
    expect(emailsTo("ny@example.com")[0].subject).toMatch(/^Medicine time \(8:00 AM\)/);
  });

  it("retries a reminder on the next run when every email failed", async () => {
    const { profileId } = await circle();
    await createMedication(profileId, { name: "Amlodipine", times: ["09:10"], startDate: "2026-03-10", scheduleChangedAt: SINCE });

    testState.failEmails = true;
    expect((await runReminders(NOW)).upcoming).toBe(0);
    expect(await ReminderLog.countDocuments({ kind: "dose-upcoming" })).toBe(0);

    testState.failEmails = false;
    expect((await runReminders(NOW)).upcoming).toBe(1);
  });
});
