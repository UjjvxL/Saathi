import { describe, expect, it } from "vitest";
import { toMedicationDTO, toProfileDTO, toSchedule } from "@/lib/dto";
import { formatTime12h } from "@/lib/format";
import { listTimezones } from "@/lib/timezones";
import { cn, initials, plural } from "@/lib/utils";

describe("utils", () => {
  it("joins class names and skips empty ones", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
  });

  it("makes initials from names", () => {
    expect(initials("Kamala Devi")).toBe("KD");
    expect(initials("  priya   nair  sharma ")).toBe("PN");
    expect(initials("Rahul")).toBe("R");
  });

  it("pluralises", () => {
    expect(plural(1, "dose")).toBe("1 dose");
    expect(plural(3, "dose")).toBe("3 doses");
    expect(plural(2, "person", "people")).toBe("2 people");
  });

  it("formats clock times without loading date libraries", () => {
    expect(formatTime12h("13:05")).toBe("1:05 PM");
  });

  it("lists timezones with India first and no duplicates", () => {
    const zones = listTimezones();
    expect(zones[0]).toBe("Asia/Kolkata");
    expect(new Set(zones).size).toBe(zones.length);
    expect(zones).toContain("America/New_York");
  });
});

describe("database mappers", () => {
  const id = { toString: () => "abc123" };

  it("fills in safe defaults for medicines", () => {
    const med = toMedicationDTO({
      _id: id,
      name: "Metformin",
      times: ["20:00", "08:00"],
      startDate: "2026-01-01",
      form: "unknown-form",
      createdAt: new Date("2026-01-01T00:00:00Z"),
    });
    expect(med).toMatchObject({
      id: "abc123",
      form: "tablet",
      frequency: "daily",
      times: ["08:00", "20:00"],
      unitsPerDose: 1,
      stock: null,
      active: true,
      scheduleChangedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(toSchedule(med).activeFrom).toEqual(new Date("2026-01-01T00:00:00Z"));
  });

  it("fills in safe defaults for profiles", () => {
    const profile = toProfileDTO({
      _id: id,
      name: "Kamala",
      careId: "K7M2XQ",
      timezone: "Asia/Kolkata",
      passcodeUpdatedAt: new Date("2026-01-01T00:00:00Z"),
    });
    expect(profile).toMatchObject({ conditions: [], allergies: [], elderEmail: null, missedAfterMinutes: 30, escalateAfterMinutes: 60 });
  });
});
