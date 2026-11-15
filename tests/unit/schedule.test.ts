import { describe, expect, it } from "vitest";
import {
  dayPart,
  describeSchedule,
  doseStatus,
  dosesForDate,
  formatTime12h,
  isScheduledDose,
  isScheduledOn,
  isValidDate,
  isValidTime,
  isValidTimezone,
  shiftDate,
  summarizeAdherence,
  todayInZone,
  utcToZoned,
  zonedToUtc,
  type ScheduleLike,
} from "@/lib/schedule";

const IST = "Asia/Kolkata";

function med(overrides: Partial<ScheduleLike> = {}): ScheduleLike {
  return {
    id: "med-a",
    times: ["08:00", "20:00"],
    frequency: "daily",
    daysOfWeek: [],
    startDate: "2024-01-01",
    endDate: null,
    ...overrides,
  };
}

describe("validators", () => {
  it("accepts 24h times only", () => {
    expect(isValidTime("08:30")).toBe(true);
    expect(isValidTime("23:59")).toBe(true);
    expect(isValidTime("24:00")).toBe(false);
    expect(isValidTime("8:30")).toBe(false);
  });

  it("accepts real calendar dates only", () => {
    expect(isValidDate("2024-02-29")).toBe(true);
    expect(isValidDate("2023-02-29")).toBe(false);
    expect(isValidDate("2024-1-1")).toBe(false);
  });

  it("recognises IANA timezones", () => {
    expect(isValidTimezone(IST)).toBe(true);
    expect(isValidTimezone("Mars/Olympus")).toBe(false);
    expect(isValidTimezone("")).toBe(false);
  });
});

describe("timezone conversion", () => {
  it("converts local medicine times to the right instant", () => {
    expect(zonedToUtc("2024-01-01", "08:00", IST).toISOString()).toBe("2024-01-01T02:30:00.000Z");
  });

  it("round-trips an instant back to local date and time", () => {
    expect(utcToZoned(new Date("2024-01-01T20:00:00.000Z"), IST)).toEqual({ localDate: "2024-01-02", localTime: "01:30" });
  });

  it("knows 'today' in the elder's timezone, not the server's", () => {
    expect(todayInZone(IST, new Date("2024-01-01T20:00:00.000Z"))).toBe("2024-01-02");
    expect(todayInZone("America/New_York", new Date("2024-01-01T20:00:00.000Z"))).toBe("2024-01-01");
  });

  it("handles daylight-saving days", () => {
    // New York springs forward on 2024-03-10: 08:00 local is 12:00 UTC (EDT), not 13:00.
    expect(zonedToUtc("2024-03-10", "08:00", "America/New_York").toISOString()).toBe("2024-03-10T12:00:00.000Z");
  });

  it("shifts dates across month and year boundaries", () => {
    expect(shiftDate("2024-01-31", 1)).toBe("2024-02-01");
    expect(shiftDate("2024-01-01", -1)).toBe("2023-12-31");
  });
});

describe("isScheduledOn", () => {
  it("respects start and end dates", () => {
    const m = med({ startDate: "2024-01-05", endDate: "2024-01-10" });
    expect(isScheduledOn(m, "2024-01-04")).toBe(false);
    expect(isScheduledOn(m, "2024-01-05")).toBe(true);
    expect(isScheduledOn(m, "2024-01-10")).toBe(true);
    expect(isScheduledOn(m, "2024-01-11")).toBe(false);
  });

  it("only schedules chosen weekdays", () => {
    // 2024-01-01 was a Monday (ISO weekday 1).
    const m = med({ frequency: "specific_days", daysOfWeek: [1, 3] });
    expect(isScheduledOn(m, "2024-01-01")).toBe(true); // Monday
    expect(isScheduledOn(m, "2024-01-02")).toBe(false); // Tuesday
    expect(isScheduledOn(m, "2024-01-03")).toBe(true); // Wednesday
  });
});

describe("dosesForDate", () => {
  it("lists every dose of every medicine, sorted by time", () => {
    const doses = dosesForDate(
      [med({ id: "b", times: ["20:00", "08:00"] }), med({ id: "a", times: ["08:00"] })],
      "2024-01-01",
      IST,
    );
    expect(doses.map((d) => `${d.localTime}:${d.medicationId}`)).toEqual(["08:00:a", "08:00:b", "20:00:b"]);
    expect(doses[0].scheduledFor.toISOString()).toBe("2024-01-01T02:30:00.000Z");
  });

  it("ignores duplicate and invalid times", () => {
    const doses = dosesForDate([med({ times: ["08:00", "08:00", "bad"] })], "2024-01-01", IST);
    expect(doses).toHaveLength(1);
  });

  it("does not expect doses from before the medicine was added", () => {
    // Added at 3 PM IST: that morning's 8 AM dose shouldn't count as missed.
    const addedAt = zonedToUtc("2024-01-01", "15:00", IST);
    const doses = dosesForDate([med({ activeFrom: addedAt })], "2024-01-01", IST);
    expect(doses.map((d) => d.localTime)).toEqual(["20:00"]);
  });
});

describe("isScheduledDose", () => {
  const m = med();

  it("accepts real scheduled doses", () => {
    expect(isScheduledDose(m, zonedToUtc("2024-01-02", "20:00", IST), IST)).toBe(true);
  });

  it("rejects forged times and dates", () => {
    expect(isScheduledDose(m, zonedToUtc("2024-01-02", "20:01", IST), IST)).toBe(false);
    expect(isScheduledDose(m, zonedToUtc("2023-12-31", "08:00", IST), IST)).toBe(false);
    expect(isScheduledDose(m, new Date("2024-01-02T14:30:00.500Z"), IST)).toBe(false);
    expect(isScheduledDose(m, new Date("not a date"), IST)).toBe(false);
  });
});

describe("doseStatus", () => {
  const due = new Date("2024-01-01T02:30:00.000Z");
  const at = (minutes: number) => new Date(due.getTime() + minutes * 60_000);

  it("is upcoming before the time, pending until the escalation time, then unconfirmed", () => {
    expect(doseStatus(due, null, at(-5), 30)).toBe("upcoming");
    expect(doseStatus(due, null, at(0), 30)).toBe("pending");
    expect(doseStatus(due, null, at(29), 30)).toBe("pending");
    expect(doseStatus(due, null, at(30), 30)).toBe("unconfirmed");
  });

  it("never turns an unrecorded dose into taken or missed", () => {
    for (const minutes of [-60, 0, 15, 45, 600, 10_000]) {
      expect(["upcoming", "pending", "unconfirmed"]).toContain(doseStatus(due, null, at(minutes), 30));
    }
  });

  it("always prefers what was actually recorded", () => {
    expect(doseStatus(due, "taken", at(-60), 30)).toBe("taken");
    expect(doseStatus(due, "skipped", at(500), 30)).toBe("skipped");
    expect(doseStatus(due, "missed", at(500), 30)).toBe("missed");
    expect(doseStatus(due, "unconfirmed", at(500), 30)).toBe("unconfirmed");
  });
});

describe("summarizeAdherence", () => {
  it("counts taken, skipped, missed and unconfirmed doses, but not pending or upcoming ones", () => {
    expect(
      summarizeAdherence(["taken", "taken", "missed", "unconfirmed", "skipped", "upcoming", "pending"]),
    ).toEqual({
      taken: 2,
      skipped: 1,
      missed: 1,
      unconfirmed: 1,
      pending: 1,
      total: 5,
      rate: 40,
    });
    expect(summarizeAdherence(["taken", "taken", "missed"]).rate).toBe(67);
    expect(summarizeAdherence(["taken", "unconfirmed"]).rate).toBe(50);
  });

  it("has no rate when nothing is decided yet", () => {
    expect(summarizeAdherence(["upcoming"]).rate).toBeNull();
  });
});

describe("formatting", () => {
  it("formats 12-hour times", () => {
    expect(formatTime12h("00:15")).toBe("12:15 AM");
    expect(formatTime12h("08:05")).toBe("8:05 AM");
    expect(formatTime12h("12:00")).toBe("12:00 PM");
    expect(formatTime12h("23:59")).toBe("11:59 PM");
  });

  it("groups times into parts of the day", () => {
    expect(dayPart("06:00")).toBe("morning");
    expect(dayPart("12:00")).toBe("afternoon");
    expect(dayPart("18:30")).toBe("evening");
    expect(dayPart("22:00")).toBe("night");
    expect(dayPart("02:00")).toBe("night");
  });

  it("describes schedules in plain words", () => {
    expect(describeSchedule(med())).toBe("Daily · 8:00 AM, 8:00 PM");
    expect(describeSchedule(med({ frequency: "specific_days", daysOfWeek: [5, 1], times: ["09:00"] }))).toBe(
      "Mon, Fri · 9:00 AM",
    );
  });
});
