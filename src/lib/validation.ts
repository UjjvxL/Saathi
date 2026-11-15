// Input validation for every form and API. Server actions never trust client input.
import { z } from "zod";
import { FREQUENCIES, MED_FORMS, ROLES } from "./constants";
import { isValidDate, isValidTime, isValidTimezone } from "./schedule";
import { normalizeCareId } from "./security";

const text = (max: number) => z.string().trim().max(max, `Please keep this under ${max} characters`);
const optionalText = (max: number) => text(max).transform((value) => value || null);

const email = z.string().trim().toLowerCase().max(254).pipe(z.email("Enter a valid email address"));
const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .refine((value) => value === "" || z.email().safeParse(value).success, "Enter a valid email address")
  .transform((value) => value || null);

const dateString = z.string().trim().refine(isValidDate, "Pick a valid date");
const optionalDate = z
  .string()
  .trim()
  .refine((value) => value === "" || isValidDate(value), "Pick a valid date")
  .transform((value) => value || null);
const timeString = z.string().trim().refine(isValidTime, "Use a time like 08:30");

const commaList = z
  .string()
  .trim()
  .max(500)
  .transform((value) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 20),
  );

const optionalCount = z
  .string()
  .trim()
  .refine((value) => value === "" || (/^\d+$/.test(value) && Number(value) <= 100_000), "Enter a whole number")
  .transform((value) => (value === "" ? null : Number(value)));

const unitsPerDose = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || (/^\d+(\.\d+)?$/.test(value) && Number(value) > 0 && Number(value) <= 100),
    "Enter a number like 1 or 0.5",
  )
  .transform((value) => (value === "" ? 1 : Number(value)));

export const signupSchema = z.object({
  name: z.string().trim().min(2, "Please enter your name").max(80),
  email,
  password: z.string().min(8, "Use at least 8 characters").max(128, "Use at most 128 characters"),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password").max(128),
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z
  .object({
    password: z.string().min(8, "Use at least 8 characters").max(128, "Use at most 128 characters"),
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "The passwords don’t match",
  });

export const profileSchema = z.object({
  name: z.string().trim().min(2, "Enter the elder’s full name").max(80),
  elderEmail: optionalEmail,
  dateOfBirth: optionalDate,
  timezone: z.string().trim().refine(isValidTimezone, "Pick a valid timezone"),
  conditions: commaList,
  allergies: commaList,
  emergencyContactName: optionalText(80),
  emergencyContactPhone: optionalText(30),
});

export const createProfileSchema = profileSchema.extend({
  relationship: z.enum(ROLES, "Choose how you are related"),
});

export const medicationSchema = z
  .object({
    name: z.string().trim().min(1, "Enter the medicine name").max(120),
    dosage: text(60),
    form: z.enum(MED_FORMS, "Choose a form"),
    instructions: text(300),
    times: z
      .array(timeString)
      .min(1, "Add at least one time")
      .max(8, "Up to 8 times a day")
      .transform((times) => [...new Set(times)].sort()),
    frequency: z.enum(FREQUENCIES),
    daysOfWeek: z
      .array(z.coerce.number().int().min(1).max(7))
      .max(7)
      .transform((days) => [...new Set(days)].sort()),
    startDate: dateString,
    endDate: optionalDate,
    stock: optionalCount,
    unitsPerDose,
    refillThreshold: optionalCount,
  })
  .superRefine((value, ctx) => {
    if (value.frequency === "specific_days" && value.daysOfWeek.length === 0) {
      ctx.addIssue({ code: "custom", path: ["daysOfWeek"], message: "Pick at least one day" });
    }
    if (value.endDate && value.endDate < value.startDate) {
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "End date can’t be before the start date" });
    }
  });
export type MedicationInput = z.infer<typeof medicationSchema>;

export const appointmentSchema = z.object({
  doctorName: z.string().trim().min(2, "Enter the doctor’s name").max(100),
  specialty: text(80),
  location: text(200),
  date: dateString,
  time: timeString,
  notes: text(1000),
});

export const joinSchema = z.object({
  careId: z.string().transform(normalizeCareId).pipe(z.string().length(6, "The Care ID has 6 letters/numbers")),
  passcode: z.string().trim().regex(/^\d{6}$/, "The passcode is 6 digits"),
  relationship: z.enum(ROLES, "Choose how you are related"),
});

export const reminderSettingsSchema = z
  .object({
    missedAfterMinutes: z.coerce.number().int().min(10).max(240),
    escalateAfterMinutes: z.coerce.number().int().min(15).max(480),
  })
  .refine((value) => value.escalateAfterMinutes > value.missedAfterMinutes, {
    path: ["escalateAfterMinutes"],
    message: "The family alert must come after the missed-dose reminder",
  });

/** Medicines suggested by the AI prescription reader (validated again before saving). */
export const scannedMedicineSchema = z.object({
  name: z.string().trim().min(1).max(120),
  dosage: z.string().trim().max(60).catch(""),
  form: z.enum(MED_FORMS).catch("tablet"),
  times: z.array(z.string()).catch([]),
  instructions: z.string().trim().max(300).catch(""),
  durationDays: z.number().int().min(1).max(365).nullable().catch(null),
});
export const scanResultSchema = z.object({
  medicines: z.array(scannedMedicineSchema).max(20),
  notes: z.string().max(500).catch(""),
});
export type ScannedMedicine = z.infer<typeof scannedMedicineSchema>;

export type FieldErrors = Record<string, string[] | undefined>;

/** State returned by server actions used with React's useActionState. */
export interface FormState {
  ok?: boolean;
  message?: string;
  errors?: FieldErrors;
  /** Submitted values, echoed back so the form keeps them after a failed submit. */
  values?: Record<string, string>;
}

export function fieldErrors(error: z.ZodError): FieldErrors {
  return z.flattenError(error).fieldErrors as FieldErrors;
}

/** Reads text fields from FormData. Missing fields and file uploads become "". */
export function readForm<K extends string>(formData: FormData, keys: readonly K[]): Record<K, string> {
  const result = {} as Record<K, string>;
  for (const key of keys) {
    const value = formData.get(key);
    result[key] = typeof value === "string" ? value : "";
  }
  return result;
}

/** Reads a multi-value field (e.g. several `times` inputs). */
export function readFormList(formData: FormData, key: string): string[] {
  return formData.getAll(key).filter((value): value is string => typeof value === "string" && value !== "");
}
