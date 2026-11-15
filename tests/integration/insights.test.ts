import { beforeEach, describe, expect, it, vi } from "vitest";
import { summarizeInsights } from "@/app/actions/insights";
import { toProfileDTO } from "@/lib/dto";
import { weeklySummaryEmail } from "@/lib/email/weekly-summary";
import { buildWeeklySummary, getInsights } from "@/lib/insights";
import { ruleBasedSummary } from "@/lib/insights-core";
import { Alert, Appointment, DoseLog } from "@/lib/models";
import { shiftDate, todayInZone, zonedToUtc } from "@/lib/schedule";
import { addMember, createCircle, createMedication, createUser, signInAs } from "./helpers";

const gemini = vi.hoisted(() => ({
  response: "",
  error: null as Error | null,
  prompts: [] as string[],
}));
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = {
      generateContent: async ({ contents }: { contents: { parts: { text?: string }[] }[] }) => {
        gemini.prompts.push(contents.flatMap((content) => content.parts.map((part) => part.text ?? "")).join("\n"));
        if (gemini.error) throw gemini.error;
        return { text: gemini.response };
      },
    };
  },
}));

const ZONE = "Asia/Kolkata";
// Sunday 15 Nov 2026, 2:00 PM in India.
const NOW = new Date("2026-11-15T08:30:00.000Z");
const SINCE = new Date("2026-11-01T00:00:00.000Z");

type Status = "taken" | "skipped" | "missed" | "unconfirmed";

async function log(profileId: string, medicationId: { toString(): string }, localDate: string, localTime: string, status: Status) {
  await DoseLog.create({
    profileId,
    medicationId: medicationId.toString(),
    scheduledFor: zonedToUtc(localDate, localTime, ZONE),
    localDate,
    localTime,
    status,
    takenAt: status === "taken" ? zonedToUtc(localDate, localTime, ZONE) : null,
    loggedByName: status === "unconfirmed" ? null : "Priya Nair",
  });
}

function range(from: string, to: string): string[] {
  const dates: string[] = [];
  for (let date = from; date <= to; date = shiftDate(date, 1)) dates.push(date);
  return dates;
}

/** Two weeks of records in the database: the same story the unit tests check, end to end. */
async function seedTwoWeeks() {
  const rahul = await createUser("Rahul Sharma");
  const priya = await createUser("Priya Nair");
  const { profile, profileId } = await createCircle(rahul, { name: "Kamala Devi" });
  await addMember(profileId, priya, "caretaker");
  const base = { startDate: "2026-11-02", scheduleChangedAt: SINCE };
  const metformin = await createMedication(profileId, { ...base, name: "Metformin", dosage: "500 mg", times: ["08:00", "20:00"] });
  const amlodipine = await createMedication(profileId, { ...base, name: "Amlodipine", dosage: "5 mg", times: ["08:00"] });
  await createMedication(profileId, { name: "Calcium", dosage: "", times: ["13:45"], startDate: "2026-11-15", scheduleChangedAt: SINCE });

  for (const date of range("2026-11-02", "2026-11-08")) {
    await log(profileId, metformin._id, date, "08:00", "taken");
    await log(profileId, amlodipine._id, date, "08:00", "taken");
    // The reminder engine records "unconfirmed" when nobody confirms in time.
    await log(profileId, metformin._id, date, "20:00", date >= "2026-11-07" ? "unconfirmed" : "taken");
  }
  for (const date of range("2026-11-09", "2026-11-14")) {
    await log(profileId, metformin._id, date, "08:00", "taken");
    await log(profileId, amlodipine._id, date, "08:00", date === "2026-11-10" ? "skipped" : "taken");
    // Friday's evening dose is left without any record: it still counts as unconfirmed.
    if (date === "2026-11-11") await log(profileId, metformin._id, date, "20:00", "missed");
    else if (date !== "2026-11-13") await log(profileId, metformin._id, date, "20:00", "taken");
  }
  await log(profileId, metformin._id, "2026-11-15", "08:00", "taken");
  await log(profileId, amlodipine._id, "2026-11-15", "08:00", "taken");

  await Alert.create({
    profileId,
    slot: zonedToUtc("2026-11-13", "20:00", ZONE),
    localDate: "2026-11-13",
    localTime: "20:00",
    medicationIds: [metformin._id],
    medicines: ["Metformin 500 mg"],
    status: "acknowledged",
    escalatedAt: new Date("2026-11-13T15:00:00.000Z"),
    notifiedUserIds: [priya._id],
    notifiedNames: ["Priya Nair"],
    acknowledgedAt: new Date("2026-11-13T15:12:00.000Z"),
    acknowledgedById: priya._id,
    acknowledgedByName: "Priya Nair",
  });
  await Alert.create({
    profileId,
    slot: zonedToUtc("2026-11-08", "20:00", ZONE),
    localDate: "2026-11-08",
    localTime: "20:00",
    medicationIds: [metformin._id],
    medicines: ["Metformin 500 mg"],
    status: "open",
    escalatedAt: new Date("2026-11-08T15:00:00.000Z"),
    notifiedNames: ["Priya Nair"],
  });
  await Appointment.create({ profileId, doctorName: "Dr. Mehta", dateTime: new Date("2026-11-18T04:30:00.000Z") });
  await Appointment.create({ profileId, doctorName: "Dr. Rao", dateTime: new Date("2026-11-25T04:30:00.000Z") });

  return { profile: toProfileDTO(profile), profileId, rahul, priya };
}

describe("health insights from real records", () => {
  it("calculates the week from the database, matching the underlying dose logs", async () => {
    const { profile } = await seedTwoWeeks();
    const report = await getInsights(profile, NOW);

    expect(report.week.summary).toEqual({ taken: 17, skipped: 1, missed: 1, unconfirmed: 1, pending: 1, total: 20, rate: 85 });
    expect(report.previousWeek.summary.rate).toBe(90);
    expect(report.change).toBe(-5);
    // Exactly what's stored: 17 "taken" logs this week, and Friday's evening dose has no log at all.
    expect(await DoseLog.countDocuments({ localDate: { $gte: "2026-11-09", $lte: "2026-11-15" }, status: "taken" })).toBe(17);
    expect(await DoseLog.countDocuments({ localDate: "2026-11-13", localTime: "20:00" })).toBe(0);

    expect(report.frequentlyMissed[0]).toMatchObject({ name: "Metformin", timeLabel: "8:00 PM", notTaken: 4, counted: 13 });
    expect(report.patterns.findings.map((finding) => finding.key)).toEqual(["evening"]);
    expect(report.incidents.map((incident) => [incident.dateLabel, incident.acknowledgedByName, incident.minutesToAcknowledge])).toEqual([
      ["Fri, 13 Nov", "Priya Nair", 12],
    ]);
    expect(report.upcomingAppointments.map((appointment) => appointment.doctorName)).toEqual(["Dr. Mehta"]);
    expect(report.insights[0].text).toBe("Kamala Devi’s medication adherence this week was 85% (17 of 20 doses taken).");
  });

  it("builds the weekly family summary for the previous Monday–Sunday", async () => {
    const { profile } = await seedTwoWeeks();
    const summary = await buildWeeklySummary(profile, NOW);

    expect(summary).toMatchObject({
      weekId: "2026-W45",
      from: "2026-11-02",
      to: "2026-11-08",
      fromLabel: "Mon, 2 Nov",
      toLabel: "Sun, 8 Nov",
      periodLabel: "Mon, 2 Nov – Sun, 8 Nov 2026",
      elderName: "Kamala Devi",
      hasData: true,
    });
    expect(summary.report.period).toBe("calendar");
    expect(summary.report.week.summary).toMatchObject({ taken: 19, unconfirmed: 2, total: 21, rate: 90 });
    expect(summary.report.insights[0].text).toBe("Kamala Devi’s medication adherence last week was 90% (19 of 21 doses taken).");

    const email = weeklySummaryEmail(summary, "https://saathi.test/p/kamala/insights");
    expect(email.subject).toBe("Kamala Devi’s weekly care summary (Mon, 2 Nov – Sun, 8 Nov)");
    // Notification previews (subject and opening lines) never name a medicine.
    const preview = email.text.split("\n").slice(0, 3).join(" ");
    for (const medicine of ["Metformin", "Amlodipine", "Calcium"]) {
      expect(email.subject).not.toContain(medicine);
      expect(preview).not.toContain(medicine);
    }
    expect(email.text).toContain("Kamala Devi’s week: 90% of doses taken");
    expect(email.text).toContain("Taken: 19");
    expect(email.text).toContain("Unconfirmed (nobody recorded it in time): 2");
    expect(email.text).toContain("https://saathi.test/p/kamala/insights");
    expect(email.html).not.toContain("<script");
  });

  it("knows when a week had nothing scheduled", async () => {
    const owner = await createUser("Rahul");
    const { profile } = await createCircle(owner);
    const summary = await buildWeeklySummary(toProfileDTO(profile), NOW);
    expect(summary.hasData).toBe(false);
    expect(summary.report.insights.map((insight) => insight.id)).toEqual(["no-doses"]);
  });
});

/**
 * A one-day history: yesterday only, so the numbers don't depend on the time of day the tests run
 * (the action reads the real clock itself). Two counted doses: one taken, one unconfirmed.
 */
async function seedRecent() {
  const rahul = await createUser("Rahul Sharma");
  const { profile, profileId } = await createCircle(rahul, { name: "Kamala Devi", elderEmail: "kamala@example.com" });
  const yesterday = shiftDate(todayInZone(ZONE), -1);
  const med = await createMedication(profileId, {
    name: "Metformin",
    dosage: "500 mg",
    times: ["08:00", "20:00"],
    startDate: yesterday,
    endDate: yesterday,
    scheduleChangedAt: zonedToUtc(yesterday, "00:00", ZONE),
  });
  await log(profileId, med._id, yesterday, "08:00", "taken");
  await log(profileId, med._id, yesterday, "20:00", "unconfirmed");
  await signInAs(rahul);
  return { profile: toProfileDTO(profile), profileId, rahul };
}

describe("AI summary action", () => {
  beforeEach(() => {
    gemini.response = "";
    gemini.error = null;
    gemini.prompts.length = 0;
    delete process.env.GEMINI_API_KEY;
  });

  async function withKey<T>(run: () => Promise<T>): Promise<T> {
    process.env.GEMINI_API_KEY = "test-key";
    try {
      return await run();
    } finally {
      delete process.env.GEMINI_API_KEY;
    }
  }

  it("explains when AI isn't set up", async () => {
    const { profileId } = await seedRecent();
    expect(await summarizeInsights(profileId, {}, new FormData())).toEqual({ message: "AI summaries aren’t set up on this server." });
  });

  it("is only for members of the care circle", async () => {
    const { profileId } = await seedRecent();
    await signInAs(await createUser("Stranger"));
    const state = await withKey(() => summarizeInsights(profileId, {}, new FormData()));
    expect(state.message).toBe("You don’t have access to this care profile.");
    expect(gemini.prompts).toHaveLength(0);
  });

  it("shows Gemini's summary when it only uses the numbers it was given", async () => {
    const { profileId } = await seedRecent();
    gemini.response = JSON.stringify({ summary: "This week, 1 of 2 counted doses was taken. One dose was left unconfirmed." });
    const state = await withKey(() => summarizeInsights(profileId, {}, new FormData()));
    expect(state).toEqual({ ok: true, source: "gemini", summary: "This week, 1 of 2 counted doses was taken. One dose was left unconfirmed." });

    // Gemini only ever sees numbers and medicine labels: no names or emails.
    expect(gemini.prompts).toHaveLength(1);
    for (const secret of ["Kamala", "Rahul", "kamala@example.com", "@example.com"]) expect(gemini.prompts[0]).not.toContain(secret);
    expect(gemini.prompts[0]).toContain("\"dosesCounted\": 2");
  });

  it.each([
    ["advice", "This week, 1 of 2 doses was taken. The family should increase the evening dose."],
    ["an invented number", "This week, 37 of 41 doses were taken, a lovely week overall."],
    ["unreadable output", "not json"],
  ])("falls back to Saathi's own summary when Gemini's answer has %s", async (_label, answer) => {
    const { profile, profileId } = await seedRecent();
    gemini.response = answer === "not json" ? answer : JSON.stringify({ summary: answer });
    const state = await withKey(() => summarizeInsights(profileId, {}, new FormData()));
    expect(state.source).toBe("rules");
    expect(state.summary).toBe(ruleBasedSummary(await getInsights(profile)));
    expect(state.message).toMatch(/safety checks/);
  });

  it("falls back when Gemini is unavailable", async () => {
    const { profileId } = await seedRecent();
    gemini.error = new Error("PERMISSION_DENIED: API key not valid");
    const state = await withKey(() => summarizeInsights(profileId, {}, new FormData()));
    expect(state).toMatchObject({ ok: true, source: "rules" });
    expect(state.message).toMatch(/isn’t available right now/);
  });

  it("doesn't call Gemini when there's nothing to summarise", async () => {
    const owner = await createUser("Rahul");
    const { profileId } = await createCircle(owner);
    await signInAs(owner);
    const state = await withKey(() => summarizeInsights(profileId, {}, new FormData()));
    expect(state).toMatchObject({ ok: true, source: "rules", message: "There isn’t enough data this week for an AI summary yet." });
    expect(gemini.prompts).toHaveLength(0);
  });

  it("limits how often one person can ask", async () => {
    const { profileId } = await seedRecent();
    gemini.response = JSON.stringify({ summary: "This week, 1 of 2 counted doses was taken. One dose was left unconfirmed." });
    await withKey(async () => {
      for (let i = 0; i < 6; i++) expect((await summarizeInsights(profileId, {}, new FormData())).source).toBe("gemini");
      expect((await summarizeInsights(profileId, {}, new FormData())).message).toMatch(/6 summaries this hour/);
    });
  });
});
