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

/**
 * Statuses stored for a single dose. "taken", "skipped" and "missed" are always recorded by a person;
 * "unconfirmed" is recorded by Saathi when nobody confirmed the dose in time. Saathi never records "taken".
 */
export const DOSE_LOG_STATUSES = ["taken", "skipped", "missed", "unconfirmed"] as const;
export type DoseLogStatus = (typeof DOSE_LOG_STATUSES)[number];
/** Statuses a person can record. */
export const DOSE_DECISIONS = ["taken", "skipped", "missed"] as const;
export type DoseDecision = (typeof DOSE_DECISIONS)[number];
/**
 * Statuses shown in the UI. "upcoming" (not due yet) and "pending" (due, waiting for confirmation)
 * are computed from the clock, never stored. A pending dose becomes "unconfirmed" at the escalation time.
 */
export type DoseStatus = DoseLogStatus | "upcoming" | "pending";
export const DOSE_STATUS_LABELS: Record<DoseStatus, string> = {
  upcoming: "Upcoming",
  pending: "Pending",
  taken: "Taken",
  skipped: "Skipped",
  missed: "Missed",
  unconfirmed: "Unconfirmed",
};

export const APPOINTMENT_STATUSES = ["scheduled", "completed", "cancelled"] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

/** An escalated dose slot: "open" until someone acknowledges it, "resolved" once every dose is confirmed. */
export const ALERT_STATUSES = ["open", "acknowledged", "resolved"] as const;
export type AlertStatus = (typeof ALERT_STATUSES)[number];
export const ALERT_STATUS_LABELS: Record<AlertStatus, string> = {
  open: "Waiting for someone",
  acknowledged: "Someone is following up",
  resolved: "Resolved",
};

/** Event types in the care timeline (the audit trail). */
export const ACTIVITY_KINDS = [
  "dose",
  "reminder",
  "alert",
  "acknowledgement",
  "responsibility",
  "medication",
  "appointment",
  "member",
  "profile",
] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];
export const ACTIVITY_KIND_LABELS: Record<ActivityKind, string> = {
  dose: "Dose update",
  reminder: "Reminder sent",
  alert: "Escalation",
  acknowledgement: "Acknowledged",
  responsibility: "Responsibility",
  medication: "Medicine change",
  appointment: "Appointment",
  member: "Care circle",
  profile: "Profile & settings",
};

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

/**
 * Reminder timings (minutes). The first reminder goes out when a dose is due (up to REMINDER_LEAD_MINUTES
 * early, since the scheduler runs every few minutes). Each care profile can change the follow-up and
 * escalation times.
 */
export const REMINDER_LEAD_MINUTES = 5;
export const DEFAULT_FOLLOW_UP_MINUTES = 15;
export const DEFAULT_ESCALATE_AFTER_MINUTES = 30;
export const FOLLOW_UP_RANGE = { min: 10, max: 120 } as const;
export const ESCALATE_RANGE = { min: 15, max: 480 } as const;
/** If nobody acknowledges an escalation in this time, the rest of the care circle is alerted (once). */
export const WIDEN_ALERT_AFTER_MINUTES = 15;

/** Invitation codes (Care ID + passcode) stop working after this many days, or when an admin revokes them. */
export const INVITE_TTL_DAYS = 7;
