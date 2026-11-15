import { describe, expect, it } from "vitest";
import {
  appointmentSchema,
  createProfileSchema,
  joinSchema,
  medicationSchema,
  reminderSettingsSchema,
  scanResultSchema,
  signupSchema,
} from "@/lib/validation";

const validMedication = {
  name: " Metformin ",
  dosage: "500 mg",
  form: "tablet",
  instructions: "After food",
  times: ["20:00", "08:00", "08:00"],
  frequency: "daily",
  daysOfWeek: [],
  startDate: "2024-01-01",
  endDate: "",
  stock: "",
  unitsPerDose: "",
  refillThreshold: "",
};

describe("signupSchema", () => {
  it("normalises email and requires a decent password", () => {
    const ok = signupSchema.safeParse({ name: "Asha", email: " Asha@Example.COM ", password: "longenough" });
    expect(ok.success && ok.data.email).toBe("asha@example.com");
    expect(signupSchema.safeParse({ name: "Asha", email: "asha@example.com", password: "short" }).success).toBe(false);
    expect(signupSchema.safeParse({ name: "Asha", email: "not-an-email", password: "longenough" }).success).toBe(false);
  });
});

describe("medicationSchema", () => {
  it("cleans up a valid medicine", () => {
    const result = medicationSchema.safeParse(validMedication);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.name).toBe("Metformin");
    expect(result.data.times).toEqual(["08:00", "20:00"]);
    expect(result.data.endDate).toBeNull();
    expect(result.data.stock).toBeNull();
    expect(result.data.unitsPerDose).toBe(1);
  });

  it("requires at least one time and real times", () => {
    expect(medicationSchema.safeParse({ ...validMedication, times: [] }).success).toBe(false);
    expect(medicationSchema.safeParse({ ...validMedication, times: ["25:00"] }).success).toBe(false);
  });

  it("requires days when the medicine is only taken on some days", () => {
    const result = medicationSchema.safeParse({ ...validMedication, frequency: "specific_days", daysOfWeek: [] });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].path).toEqual(["daysOfWeek"]);
  });

  it("rejects an end date before the start date", () => {
    expect(medicationSchema.safeParse({ ...validMedication, endDate: "2023-12-31" }).success).toBe(false);
  });

  it("parses pill counts", () => {
    const result = medicationSchema.safeParse({ ...validMedication, stock: "30", unitsPerDose: "0.5", refillThreshold: "5" });
    expect(result.success && [result.data.stock, result.data.unitsPerDose, result.data.refillThreshold]).toEqual([30, 0.5, 5]);
    expect(medicationSchema.safeParse({ ...validMedication, stock: "-3" }).success).toBe(false);
  });
});

describe("createProfileSchema", () => {
  const base = {
    name: "Kamala Devi",
    relationship: "family",
    elderEmail: "",
    dateOfBirth: "",
    timezone: "Asia/Kolkata",
    conditions: "Diabetes,  High BP , ",
    allergies: "",
    emergencyContactName: "",
    emergencyContactPhone: "",
  };

  it("turns comma lists into arrays and blanks into null", () => {
    const result = createProfileSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.conditions).toEqual(["Diabetes", "High BP"]);
    expect(result.data.elderEmail).toBeNull();
  });

  it("rejects unknown timezones and roles", () => {
    expect(createProfileSchema.safeParse({ ...base, timezone: "Nowhere/Land" }).success).toBe(false);
    expect(createProfileSchema.safeParse({ ...base, relationship: "owner" }).success).toBe(false);
  });
});

describe("joinSchema", () => {
  it("accepts a Care ID typed loosely, with a 6-digit passcode", () => {
    const result = joinSchema.safeParse({ careId: "k7m 2xq", passcode: "012345", relationship: "caretaker" });
    expect(result.success && result.data.careId).toBe("K7M2XQ");
  });

  it("rejects malformed passcodes", () => {
    expect(joinSchema.safeParse({ careId: "K7M2XQ", passcode: "12345", relationship: "family" }).success).toBe(false);
    expect(joinSchema.safeParse({ careId: "K7M2XQ", passcode: "12a456", relationship: "family" }).success).toBe(false);
  });
});

describe("reminderSettingsSchema", () => {
  it("requires the family alert to come after the nudge", () => {
    expect(reminderSettingsSchema.safeParse({ followUpAfterMinutes: "15", escalateAfterMinutes: "30" }).success).toBe(true);
    expect(reminderSettingsSchema.safeParse({ followUpAfterMinutes: "60", escalateAfterMinutes: "60" }).success).toBe(false);
    expect(reminderSettingsSchema.safeParse({ followUpAfterMinutes: "5", escalateAfterMinutes: "30" }).success).toBe(false);
  });
});

describe("appointmentSchema", () => {
  it("needs a doctor, date and time", () => {
    const ok = { doctorName: "Dr. Mehta", specialty: "", location: "", date: "2024-02-01", time: "10:30", notes: "" };
    expect(appointmentSchema.safeParse(ok).success).toBe(true);
    expect(appointmentSchema.safeParse({ ...ok, time: "10.30" }).success).toBe(false);
  });
});

describe("scanResultSchema", () => {
  it("tolerates imperfect AI output without inventing data", () => {
    const result = scanResultSchema.safeParse({
      medicines: [{ name: "Paracetamol", dosage: 500, form: "pill", times: ["08:00"], instructions: null, durationDays: 5 }],
      notes: "",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.medicines[0]).toMatchObject({ name: "Paracetamol", dosage: "", form: "tablet", instructions: "" });
  });
});
