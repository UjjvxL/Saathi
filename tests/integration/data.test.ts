import { describe, expect, it } from "vitest";
import { getDashboard, getDoseItems, getHistory, getMembers, getTodayOverview } from "@/lib/data";
import { toProfileDTO } from "@/lib/dto";
import { Appointment, DoseLog, Medication } from "@/lib/models";
import { rateLimit } from "@/lib/rate-limit";
import { RateLimit } from "@/lib/models";
import { zonedToUtc } from "@/lib/schedule";
import { addMember, createCircle, createMedication, createUser } from "./helpers";

const ZONE = "Asia/Kolkata";
const NOW = new Date("2026-03-10T08:30:00.000Z"); // 14:00 in India
const SINCE = new Date("2026-03-01T00:00:00Z");

async function logDose(
  profileId: string,
  medicationId: { toString(): string },
  localDate: string,
  localTime: string,
  status: "taken" | "skipped" | "missed" | "unconfirmed",
) {
  await DoseLog.create({
    profileId,
    medicationId: medicationId.toString(),
    scheduledFor: zonedToUtc(localDate, localTime, ZONE),
    localDate,
    localTime,
    status,
    loggedByName: "Priya",
  });
}

describe("today's doses", () => {
  it("merges the schedule with what was logged and computes live statuses", async () => {
    const owner = await createUser("Rahul");
    const { profile, profileId } = await createCircle(owner);
    const med = await createMedication(profileId, { times: ["08:00", "13:45", "20:00"], startDate: "2026-03-01", scheduleChangedAt: SINCE });
    await logDose(profileId, med._id, "2026-03-10", "08:00", "taken");

    const items = await getDoseItems(toProfileDTO(profile), ["2026-03-10"], NOW);
    expect(items.map((item) => [item.localTime, item.status, item.canMark])).toEqual([
      ["08:00", "taken", true],
      ["13:45", "pending", true], // 15 minutes ago, before the 30-minute escalation time
      ["20:00", "upcoming", false], // more than 2 hours away
    ]);
    expect(items[0].loggedByName).toBe("Priya");
  });

  it("keeps logged doses even after a medicine is rescheduled, and drops deleted medicines", async () => {
    const owner = await createUser("Rahul");
    const { profile, profileId } = await createCircle(owner);
    const med = await createMedication(profileId, { times: ["09:00"], startDate: "2026-03-01", scheduleChangedAt: SINCE });
    await logDose(profileId, med._id, "2026-03-10", "08:00", "taken"); // the old time
    const gone = await createMedication(profileId, { name: "Old", times: ["08:00"], scheduleChangedAt: SINCE });
    await logDose(profileId, gone._id, "2026-03-10", "08:00", "taken");
    await Medication.deleteOne({ _id: gone._id });

    const items = await getDoseItems(toProfileDTO(profile), ["2026-03-10"], NOW);
    expect(items.map((item) => `${item.name} ${item.localTime} ${item.status}`)).toEqual([
      "Metformin 08:00 taken",
      "Metformin 09:00 unconfirmed",
    ]);
  });

  it("summarises the day with low stock and the next appointments", async () => {
    const owner = await createUser("Rahul");
    const { profile, profileId } = await createCircle(owner);
    await createMedication(profileId, { times: ["08:00"], stock: 3, refillThreshold: 5, scheduleChangedAt: SINCE });
    await Appointment.create({ profileId, doctorName: "Later", dateTime: new Date(Date.now() + 3 * 86_400_000) });
    await Appointment.create({ profileId, doctorName: "Sooner", dateTime: new Date(Date.now() + 86_400_000) });
    await Appointment.create({ profileId, doctorName: "Past", dateTime: new Date(Date.now() - 86_400_000) });

    const overview = await getTodayOverview(toProfileDTO(profile));
    expect(overview.lowStock.map((med) => med.name)).toEqual(["Metformin"]);
    expect(overview.nextAppointments.map((appointment) => appointment.doctorName)).toEqual(["Sooner", "Later"]);
  });
});

describe("history", () => {
  it("reports adherence per day and per medicine", async () => {
    const owner = await createUser("Rahul");
    const { profile, profileId } = await createCircle(owner);
    const med = await createMedication(profileId, { times: ["08:00"], startDate: "2026-03-08", scheduleChangedAt: SINCE });
    await logDose(profileId, med._id, "2026-03-08", "08:00", "taken");
    await logDose(profileId, med._id, "2026-03-09", "08:00", "skipped");
    await logDose(profileId, med._id, "2026-03-10", "08:00", "taken");

    const report = await getHistory(toProfileDTO(profile), 7, NOW);
    expect(report.from).toBe("2026-03-04");
    expect(report.to).toBe("2026-03-10");
    expect(report.overall).toEqual({ taken: 2, skipped: 1, missed: 0, unconfirmed: 0, pending: 0, total: 3, rate: 67 });
    expect(report.days.find((day) => day.date === "2026-03-07")?.summary.total).toBe(0);
    expect(report.byMedication).toHaveLength(1);
  });
});

describe("dashboard and members", () => {
  it("only shows circles the user belongs to", async () => {
    const rahul = await createUser("Rahul");
    const priya = await createUser("Priya");
    const mine = await createCircle(rahul, { name: "Kamala Devi" });
    await createCircle(priya, { name: "Someone Else" });
    await addMember(mine.profileId, priya, "caretaker");

    const rahulsView = await getDashboard(rahul._id.toString());
    expect(rahulsView.map((entry) => entry.profile.name)).toEqual(["Kamala Devi"]);
    const priyasView = await getDashboard(priya._id.toString());
    expect(priyasView.map((entry) => entry.profile.name).sort()).toEqual(["Kamala Devi", "Someone Else"]);

    const members = await getMembers(mine.profileId);
    expect(members.map((member) => [member.name, member.role, member.isAdmin])).toEqual([
      ["Rahul", "family", true],
      ["Priya", "caretaker", false],
    ]);
  });
});

describe("rate limiting", () => {
  it("allows up to the limit, then blocks until the window resets", async () => {
    for (let i = 0; i < 3; i++) expect((await rateLimit("test-key", 3, 60)).allowed).toBe(true);
    const blocked = await rateLimit("test-key", 3, 60);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);

    await RateLimit.updateOne({ key: "test-key" }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await rateLimit("test-key", 3, 60)).allowed).toBe(true);
  });
});
