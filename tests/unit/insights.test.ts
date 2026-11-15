import { describe, expect, it } from "vitest";
import type { DoseStatus } from "@/lib/constants";
import {
  buildAiFacts,
  computeInsights,
  countWord,
  isSafeAiSummary,
  ruleBasedSummary,
  standOut,
  type InsightsInput,
  type PatternGroup,
} from "@/lib/insights-core";
import { shiftDate } from "@/lib/schedule";
import type { AlertDTO, AppointmentDTO, DoseItem } from "@/lib/types";

// Sunday 15 Nov 2026, 2:00 PM in India. The insights week is Mon 9 – Sun 15 Nov.
const NOW = new Date("2026-11-15T08:30:00.000Z");
const ZONE = "Asia/Kolkata";

type Med = { id: string; name: string; dosage: string };
const metformin: Med = { id: "met", name: "Metformin", dosage: "500 mg" };
const amlodipine: Med = { id: "aml", name: "Amlodipine", dosage: "5 mg" };
const calcium: Med = { id: "cal", name: "Calcium", dosage: "" };

function dose(med: Med, localDate: string, localTime: string, status: DoseStatus): DoseItem {
  return {
    key: `${med.id}@${localDate}T${localTime}`,
    medicationId: med.id,
    name: med.name,
    dosage: med.dosage,
    form: "tablet",
    instructions: "",
    localDate,
    localTime,
    scheduledFor: `${localDate}T${localTime}:00.000Z`,
    status,
    canMark: true,
    takenAt: null,
    loggedByName: null,
    loggedAt: null,
    assigneeId: null,
    alert: null,
  };
}

function range(from: string, to: string): string[] {
  const dates: string[] = [];
  for (let date = from; date <= to; date = shiftDate(date, 1)) dates.push(date);
  return dates;
}

/** Two weeks of real-looking records: the week before was 90%, this week has one of every outcome. */
function twoWeeks(): DoseItem[] {
  const items: DoseItem[] = [];
  for (const date of range("2026-11-02", "2026-11-08")) {
    items.push(dose(metformin, date, "08:00", "taken"), dose(amlodipine, date, "08:00", "taken"));
    items.push(dose(metformin, date, "20:00", date === "2026-11-07" || date === "2026-11-08" ? "unconfirmed" : "taken"));
  }
  for (const date of range("2026-11-09", "2026-11-14")) {
    items.push(dose(metformin, date, "08:00", "taken"));
    items.push(dose(amlodipine, date, "08:00", date === "2026-11-10" ? "skipped" : "taken"));
    items.push(dose(metformin, date, "20:00", date === "2026-11-11" ? "missed" : date === "2026-11-13" ? "unconfirmed" : "taken"));
  }
  items.push(
    dose(metformin, "2026-11-15", "08:00", "taken"),
    dose(amlodipine, "2026-11-15", "08:00", "taken"),
    dose(calcium, "2026-11-15", "13:45", "pending"),
    dose(metformin, "2026-11-15", "20:00", "upcoming"),
  );
  return items;
}

function alert(overrides: Partial<AlertDTO> = {}): AlertDTO {
  return {
    id: "a1",
    slot: "2026-11-13T14:30:00.000Z",
    localDate: "2026-11-13",
    localTime: "20:00",
    medicationIds: ["met"],
    medicines: ["Metformin 500 mg"],
    status: "acknowledged",
    reminderSentAt: "2026-11-13T14:25:00.000Z",
    followUpSentAt: "2026-11-13T14:45:00.000Z",
    escalatedAt: "2026-11-13T15:00:00.000Z",
    notifiedUserIds: ["u1"],
    notifiedNames: ["Priya Nair"],
    widenedAt: null,
    widenedNames: [],
    acknowledgedAt: "2026-11-13T15:12:00.000Z",
    acknowledgedByName: "Priya Nair",
    resolvedAt: null,
    resolvedByName: null,
    resolution: null,
    ...overrides,
  };
}

function visit(doctorName: string, dateTime: string, status: AppointmentDTO["status"] = "scheduled"): AppointmentDTO {
  return {
    id: doctorName,
    doctorName,
    specialty: "",
    location: "",
    dateTime,
    notes: "",
    status,
    assigneeId: null,
    statusChangedAt: null,
    statusChangedByName: null,
  };
}

function input(overrides: Partial<InsightsInput> = {}): InsightsInput {
  return {
    doses: twoWeeks(),
    endDate: "2026-11-15",
    timezone: ZONE,
    now: NOW,
    elderName: "Kamala Devi",
    appointments: [
      visit("Dr. Mehta", "2026-11-18T04:30:00.000Z"), // Wed 10:00 AM: inside the next 7 days
      visit("Dr. Rao", "2026-11-25T04:30:00.000Z"), // 10 days away
      visit("Dr. Past", "2026-11-14T04:30:00.000Z"),
      visit("Dr. Cancelled", "2026-11-17T04:30:00.000Z", "cancelled"),
    ],
    alerts: [
      alert(),
      alert({ id: "old", slot: "2026-11-08T14:30:00.000Z", localDate: "2026-11-08", status: "open", acknowledgedAt: null, acknowledgedByName: null }),
    ],
    ...overrides,
  };
}

describe("weekly insights", () => {
  const report = computeInsights(input());

  it("calculates adherence from counted doses only (pending and upcoming are left out)", () => {
    expect(report.week.from).toBe("2026-11-09");
    expect(report.week.to).toBe("2026-11-15");
    expect(report.week.summary).toEqual({ taken: 17, skipped: 1, missed: 1, unconfirmed: 1, pending: 1, total: 20, rate: 85 });
    expect(report.week.scheduled).toBe(22);
    expect(report.week.upcoming).toBe(1);
    expect(report.pendingNow).toBe(1);
  });

  it("compares with the week before", () => {
    expect(report.previousWeek.summary).toMatchObject({ taken: 19, unconfirmed: 2, total: 21, rate: 90 });
    expect(report.change).toBe(-5);
  });

  it("shows each day of the week", () => {
    expect(report.week.days.map((day) => day.weekday)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    expect(report.week.days.map((day) => day.summary.rate)).toEqual([100, 67, 67, 100, 67, 100, 100]);
    const sunday = report.week.days[6];
    expect(sunday).toMatchObject({ scheduled: 4, upcoming: 1, summary: { taken: 2, pending: 1, total: 2 } });
  });

  it("keeps missed (recorded by a person) and unconfirmed (nobody recorded it) apart", () => {
    const wednesday = report.week.days[2].summary;
    const friday = report.week.days[4].summary;
    expect([wednesday.missed, wednesday.unconfirmed]).toEqual([1, 0]);
    expect([friday.missed, friday.unconfirmed]).toEqual([0, 1]);
  });

  it("ranks frequently missed doses over the last 4 weeks", () => {
    expect(report.frequentlyMissed).toEqual([
      expect.objectContaining({ name: "Metformin", localTime: "20:00", timeLabel: "8:00 PM", missed: 1, unconfirmed: 3, notTaken: 4, counted: 13 }),
    ]);
  });

  it("finds a recurring evening pattern, but no weekday pattern from one miss per day", () => {
    expect(report.patterns).toMatchObject({ from: "2026-10-19", to: "2026-11-15", counted: 41, notTaken: 4 });
    expect(report.patterns.findings).toHaveLength(1);
    expect(report.patterns.findings[0]).toMatchObject({ kind: "dayPart", key: "evening", notTaken: 4, counted: 13 });
    expect(report.patterns.note).toBe("Based on 4 missed or unconfirmed doses out of 41 counted.");
  });

  it("builds a per-medicine table for the week and the last 4 weeks", () => {
    expect(report.medications.map((row) => [row.name, row.week.rate, row.week.total, row.month.rate])).toEqual([
      ["Amlodipine", 86, 7, 93],
      ["Calcium", null, 0, null],
      ["Metformin", 85, 13, 85],
    ]);
  });

  it("lays out the week's dose history by time of day", () => {
    expect(report.doseHistory.map((row) => `${row.name} ${row.localTime}`)).toEqual([
      "Amlodipine 08:00",
      "Metformin 08:00",
      "Calcium 13:45",
      "Metformin 20:00",
    ]);
    expect(report.doseHistory[2].cells.map((cell) => cell.status)).toEqual([null, null, null, null, null, null, "pending"]);
    expect(report.doseHistory[3].cells.map((cell) => cell.status)).toEqual(["taken", "taken", "missed", "taken", "unconfirmed", "taken", "upcoming"]);
  });

  it("lists only scheduled appointments in the next 7 days, and only this week's escalations", () => {
    expect(report.upcomingAppointments.map((appointment) => appointment.doctorName)).toEqual(["Dr. Mehta"]);
    expect(report.incidents).toHaveLength(1);
    expect(report.incidents[0]).toMatchObject({ id: "a1", dateLabel: "Fri, 13 Nov", timeLabel: "8:00 PM", minutesToAcknowledge: 12, widened: false });
  });

  it("writes plain-language insights that state their numbers", () => {
    expect(report.insights.map((insight) => insight.text)).toEqual([
      "Kamala Devi’s medication adherence this week was 85% (17 of 20 doses taken).",
      "That’s 5 points lower than the week before (90%).",
      "One scheduled dose this week remains unconfirmed: nobody recorded whether it was taken.",
      "One dose was recorded as missed this week.",
      "One dose is waiting to be confirmed right now.",
      "Evening doses were missed or left unconfirmed more often than other times this week (2 of 6).",
      "Over the last 4 weeks, evening doses were missed or left unconfirmed more often than doses at other times of day (4 of 13, compared with 0 of 28).",
      "One dose was skipped this week.",
      "Saathi sent one escalation alert this week for doses nobody confirmed in time. Someone followed up 12 minutes after the alert.",
      "One doctor appointment is coming up in the next 7 days: Dr. Mehta on Wed, 18 Nov.",
    ]);
    expect(report.insights.map((insight) => insight.tone)).toEqual([
      "neutral",
      "attention",
      "attention",
      "attention",
      "neutral",
      "attention",
      "attention",
      "neutral",
      "neutral",
      "neutral",
    ]);
  });

  it("never gives advice or makes medical claims", () => {
    for (const insight of report.insights) {
      expect(insight.text).not.toMatch(/should|recommend|consult|advice|diagnos|increase|reduce|stop taking/i);
    }
  });

  it("explains the data behind the numbers", () => {
    expect(report.dataUsed).toEqual([
      "Period: Mon, 9 Nov – Sun, 15 Nov 2026 (the last 7 days, including today), in Asia/Kolkata time. Compared with Mon, 2 Nov – Sun, 8 Nov 2026.",
      "20 scheduled doses counted: 17 taken, 1 skipped, 1 missed and 1 unconfirmed.",
      "Not counted yet: 1 pending dose and 1 upcoming dose.",
      "Adherence is the share of counted doses that were taken. Skipped, missed and unconfirmed doses count as not taken.",
      "“Missed” means someone recorded that the dose wasn’t taken; “unconfirmed” means nobody recorded anything by the escalation time. Saathi never marks a dose as taken by itself.",
      "Patterns and frequently missed doses use Mon, 19 Oct – Sun, 15 Nov 2026: 41 doses counted.",
      "Doses from before a medicine was added or its schedule changed are not expected, so they never count against anyone.",
      "1 escalation alert in this period.",
    ]);
  });

  it("summarises the first insights in a few sentences", () => {
    expect(ruleBasedSummary(report)).toBe(report.insights.slice(0, 4).map((insight) => insight.text).join(" "));
  });
});

describe("finished-week insights (for the weekly email)", () => {
  const report = computeInsights(input({ endDate: "2026-11-08", period: "calendar" }));

  it("talks about last week and leaves out what is happening right now", () => {
    expect(report.week.summary).toMatchObject({ taken: 19, unconfirmed: 2, total: 21, rate: 90 });
    expect(report.change).toBeNull(); // nothing recorded the week before that
    expect(report.insights.map((insight) => insight.text)).toEqual([
      "Kamala Devi’s medication adherence last week was 90% (19 of 21 doses taken).",
      "Two scheduled doses last week remain unconfirmed: nobody recorded whether they were taken.",
      "Evening doses were missed or left unconfirmed more often than other times last week (2 of 7).",
      "Saathi sent one escalation alert last week for doses nobody confirmed in time. One alert is still waiting for someone to follow up.",
      "One doctor appointment is coming up in the next 7 days: Dr. Mehta on Wed, 18 Nov.",
    ]);
    expect(report.patterns.note).toBe("Only two doses were missed or left unconfirmed in this period: too few to call a pattern.");
    expect(report.dataUsed[0]).toContain("(Monday to Sunday)");
  });
});

describe("edge cases", () => {
  it("handles a profile with no medicines", () => {
    const report = computeInsights(input({ doses: [], appointments: [], alerts: [] }));
    expect(report.insights).toEqual([{ id: "no-doses", tone: "neutral", text: "No medicines were scheduled for Kamala Devi this week." }]);
    expect(report.week.summary.rate).toBeNull();
    expect(report.patterns.note).toBe("No doses were due in this period, so there are no patterns to look for yet.");
    expect(report.dataUsed[1]).toBe("No doses were due long enough to be counted.");
  });

  it("waits until a dose is due before giving an adherence figure", () => {
    const report = computeInsights(input({ doses: [dose(metformin, "2026-11-15", "20:00", "upcoming")], appointments: [], alerts: [] }));
    expect(report.insights.map((insight) => insight.text)).toEqual(["None of this week’s doses have been due long enough to count yet."]);
  });

  it("celebrates a week where every dose was taken", () => {
    const doses = range("2026-11-09", "2026-11-15").flatMap((date) => [
      dose(metformin, date, "08:00", "taken"),
      dose(metformin, date, "20:00", "taken"),
    ]);
    const report = computeInsights(input({ doses, appointments: [], alerts: [] }));
    expect(report.insights).toEqual([{ id: "adherence", tone: "positive", text: "Kamala Devi took every dose this week (14 of 14)." }]);
    expect(report.frequentlyMissed).toEqual([]);
    expect(report.patterns.note).toBe("No doses were missed or left unconfirmed in this period, so there is no pattern to report.");
  });

  it("spots a recurring weekday pattern over 4 weeks", () => {
    const sundays = new Set(["2026-10-25", "2026-11-01", "2026-11-08"]);
    const doses = range("2026-10-19", "2026-11-15").flatMap((date) =>
      ["08:00", "20:00"].map((time) => dose(metformin, date, time, sundays.has(date) ? "unconfirmed" : "taken")),
    );
    const report = computeInsights(input({ doses, appointments: [], alerts: [] }));
    expect(report.patterns.findings.map((finding) => finding.text)).toEqual([
      "Over the last 4 weeks, doses on Sundays were missed or left unconfirmed more often than on other days (6 of 8, compared with 0 of 48).",
    ]);
    // Mornings and evenings were equally affected, so neither is called a time-of-day pattern.
    expect(report.patterns.findings.some((finding) => finding.kind === "dayPart")).toBe(false);
  });
});

describe("standOut", () => {
  const group = (key: string, counted: number, notTaken: number): PatternGroup => ({
    key,
    label: key,
    counted,
    notTaken,
    rate: counted ? Math.round((notTaken / counted) * 100) : null,
  });

  it("never picks one of two equally bad groups", () => {
    expect(standOut([group("morning", 10, 4), group("evening", 10, 4), group("afternoon", 10, 0)], { minNotTaken: 3, minCounted: 5 })).toBeNull();
  });

  it("needs enough misses and enough doses", () => {
    expect(standOut([group("evening", 4, 2), group("morning", 20, 0)], { minNotTaken: 3, minCounted: 5 })).toBeNull();
    expect(standOut([group("evening", 8, 4), group("morning", 20, 0)], { minNotTaken: 3, minCounted: 5 })?.group.key).toBe("evening");
  });

  it("needs a clear difference from the other groups", () => {
    expect(standOut([group("evening", 10, 3), group("morning", 10, 2)], { minNotTaken: 3, minCounted: 5 })).toBeNull();
  });
});

describe("AI summary safety", () => {
  const report = computeInsights(input());
  const facts = buildAiFacts(report);

  it("only shares numbers and medicine/time labels, never people's names", () => {
    expect(facts).toMatchObject({
      period: "Mon, 9 Nov – Sun, 15 Nov 2026",
      dosesCounted: 20,
      taken: 17,
      adherencePercent: 85,
      previousWeekAdherencePercent: 90,
      changeInPoints: -5,
      mostOftenNotTaken: [{ medicine: "Metformin 500 mg", time: "8:00 PM", notTaken: 4, counted: 13 }],
      escalations: { total: 1, acknowledged: 1, stillOpen: 0, averageMinutesToAcknowledge: 12 },
      upcomingAppointments: 1,
    });
    const shared = JSON.stringify(facts);
    for (const name of ["Kamala", "Priya", "Mehta", "@"]) expect(shared).not.toContain(name);
  });

  it("accepts a factual summary", () => {
    expect(
      isSafeAiSummary(
        "This week, 17 of 20 doses were taken (85%), 5 points lower than the week before. The 8:00 PM Metformin 500 mg dose was missed or left unconfirmed most often.",
        facts,
      ),
    ).toBe(true);
  });

  it.each([
    ["advice", "This week 17 of 20 doses were taken. You should increase the evening dose."],
    ["a referral", "This week 17 of 20 doses were taken. Please consult the doctor about the evenings."],
    ["stopping a medicine", "This week 17 of 20 doses were taken, so stop taking the evening tablet."],
    ["changing a dose", "17 of 20 doses were taken; it may help to reduce the dosage of Metformin 500 mg."],
    ["a medical claim", "17 of 20 doses were taken, which is good for blood pressure this week."],
    ["an invented number", "This week, 18 of 20 doses were taken, a little better than usual."],
    ["a link", "This week 17 of 20 doses were taken. More at https://example.com today."],
    ["too short", "Good week."],
  ])("rejects %s", (_label, text) => {
    expect(isSafeAiSummary(text, facts)).toBe(false);
  });

  it("rejects an overly long answer", () => {
    expect(isSafeAiSummary(`${"This week 17 of 20 doses were taken. ".repeat(8)}`, facts)).toBe(false);
  });
});

describe("countWord", () => {
  it("spells out small numbers", () => {
    expect([countWord(0), countWord(1, true), countWord(10), countWord(11)]).toEqual(["no", "One", "ten", "11"]);
  });
});
