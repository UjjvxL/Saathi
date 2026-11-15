// Shared constants and types. Safe to import from both server and client code.

export const APP_NAME = "Saathi";
export const APP_DESCRIPTION =
  "One shared care circle for elders, family and caretakers: medicine schedules, dose tracking, doctor appointments and email reminders.";

export const SESSION_COOKIE = "saathi_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
export const TEXT_SIZE_STORAGE_KEY = "saathi-text-size";
export const DEFAULT_TIMEZONE = "Asia/Kolkata";

export const ROLES = ["elder", "caretaker", "family"] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_LABELS: Record<Role, string> = {
  elder: "Elder",
  caretaker: "Caretaker",
  family: "Family",
};

export const MED_FORMS = [
  "tablet",
  "capsule",
  "syrup",
  "injection",
  "drops",
  "inhaler",
  "cream",
  "other",
] as const;
export type MedForm = (typeof MED_FORMS)[number];

export const FREQUENCIES = ["daily", "specific_days"] as const;
export type Frequency = (typeof FREQUENCIES)[number];

/** Statuses that are stored in the database for a single dose. */
export const DOSE_LOG_STATUSES = ["taken", "skipped", "missed"] as const;
export type DoseLogStatus = (typeof DOSE_LOG_STATUSES)[number];
/** Statuses shown in the UI. "upcoming" and "due" are computed, never stored. */
export type DoseStatus = DoseLogStatus | "upcoming" | "due";

export const APPOINTMENT_STATUSES = ["scheduled", "completed", "cancelled"] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

/** ISO weekday numbers: 1 = Monday … 7 = Sunday (matches Luxon). */
export const WEEKDAYS = [
  { value: 1, short: "Mon", long: "Monday" },
  { value: 2, short: "Tue", long: "Tuesday" },
  { value: 3, short: "Wed", long: "Wednesday" },
  { value: 4, short: "Thu", long: "Thursday" },
  { value: 5, short: "Fri", long: "Friday" },
  { value: 6, short: "Sat", long: "Saturday" },
  { value: 7, short: "Sun", long: "Sunday" },
] as const;

/** Default reminder timings (minutes). Each care profile can override the missed/escalation values. */
export const REMINDER_LEAD_MINUTES = 15;
export const DEFAULT_MISSED_AFTER_MINUTES = 30;
export const DEFAULT_ESCALATE_AFTER_MINUTES = 60;
