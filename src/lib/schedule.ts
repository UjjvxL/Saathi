// Pure scheduling helpers. No database or framework imports, so they are easy to unit test.
import { DateTime } from "luxon";
import type { DoseLogStatus, DoseStatus, Frequency } from "./constants";
import { formatTime12h } from "./format";

export interface ScheduleLike {
  id: string;
  times: string[];
  frequency: Frequency;
  daysOfWeek: number[];
  /** Local start date, YYYY-MM-DD (inclusive). */
  startDate: string;
  /** Local end date, YYYY-MM-DD (inclusive), or null for ongoing. */
  endDate: string | null;
  /**
   * Doses before this instant are ignored: the moment the schedule was created or last changed.
   * Adding a medicine at 3 PM shouldn't make that morning's dose show up as "missed".
   */
  activeFrom?: Date | null;
}

export interface ScheduledDose {
  medicationId: string;
  /** Local calendar date of the dose in the profile's timezone (YYYY-MM-DD). */
  localDate: string;
  /** Local wall-clock time of the dose (HH:mm, 24h). */
  localTime: string;
  /** The exact instant the dose is due. */
  scheduledFor: Date;
}

export interface AdherenceSummary {
  taken: number;
  skipped: number;
  /** Confirmed by a person as not taken. */
  missed: number;
  /** Nobody confirmed the dose by the escalation time. */
  unconfirmed: number;
  /** Due now and waiting for confirmation (not counted in the rate yet). */
  pending: number;
  /** Doses whose outcome counts: taken + skipped + missed + unconfirmed. */
  total: number;
  /** Percentage of counted doses that were taken, or null if there were none. */
  rate: number | null;
}

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isValidTime(value: string): boolean {
  return TIME_PATTERN.test(value);
}

export function isValidDate(value: string): boolean {
  return DATE_PATTERN.test(value) && DateTime.fromISO(value).isValid;
}

export function isValidTimezone(zone: string): boolean {
  return zone.length > 0 && DateTime.local().setZone(zone).isValid;
}

function toIsoDate(dt: DateTime): string {
  const value = dt.toISODate();
  if (!value) throw new Error(`Invalid date: ${dt.invalidReason ?? "unknown"}`);
  return value;
}

/** Today's date (YYYY-MM-DD) in the given timezone. */
export function todayInZone(zone: string, now: Date = new Date()): string {
  return toIsoDate(DateTime.fromJSDate(now, { zone }));
}

/** Adds (or subtracts) whole days to a YYYY-MM-DD date string. */
export function shiftDate(localDate: string, days: number): string {
  return toIsoDate(DateTime.fromISO(localDate).plus({ days }));
}

/** Converts a local date + time in a timezone into an absolute instant. */
export function zonedToUtc(localDate: string, localTime: string, zone: string): Date {
  const dt = DateTime.fromISO(`${localDate}T${localTime}`, { zone });
  if (!dt.isValid) throw new Error(`Invalid local date/time: ${localDate} ${localTime} (${zone})`);
  return dt.toJSDate();
}

/** Splits an instant into the local date and time of a timezone. */
export function utcToZoned(instant: Date, zone: string): { localDate: string; localTime: string } {
  const dt = DateTime.fromJSDate(instant, { zone });
  return { localDate: toIsoDate(dt), localTime: dt.toFormat("HH:mm") };
}

export function isScheduledOn(med: ScheduleLike, localDate: string): boolean {
  if (localDate < med.startDate) return false;
  if (med.endDate && localDate > med.endDate) return false;
  if (med.frequency === "specific_days") {
    const weekday = DateTime.fromISO(localDate).weekday; // 1 = Monday … 7 = Sunday
    return med.daysOfWeek.includes(weekday);
  }
  return true;
}

/** Every dose due on a local date, sorted by time. */
export function dosesForDate(meds: ScheduleLike[], localDate: string, zone: string): ScheduledDose[] {
  const doses: ScheduledDose[] = [];
  for (const med of meds) {
    if (!isScheduledOn(med, localDate)) continue;
    for (const localTime of new Set(med.times)) {
      if (!isValidTime(localTime)) continue;
      const scheduledFor = zonedToUtc(localDate, localTime, zone);
      if (med.activeFrom && scheduledFor < med.activeFrom) continue;
      doses.push({ medicationId: med.id, localDate, localTime, scheduledFor });
    }
  }
  return doses.sort(
    (a, b) =>
      a.scheduledFor.getTime() - b.scheduledFor.getTime() || a.medicationId.localeCompare(b.medicationId),
  );
}

/** True when `scheduledFor` is exactly one of the medicine's scheduled doses. Used to reject forged dose logs. */
export function isScheduledDose(med: ScheduleLike, scheduledFor: Date, zone: string): boolean {
  if (Number.isNaN(scheduledFor.getTime())) return false;
  const { localDate, localTime } = utcToZoned(scheduledFor, zone);
  if (!med.times.includes(localTime) || !isScheduledOn(med, localDate)) return false;
  if (med.activeFrom && scheduledFor < med.activeFrom) return false;
  return zonedToUtc(localDate, localTime, zone).getTime() === scheduledFor.getTime();
}

/** Works out what a dose looks like right now, given its log entry (if any). */
/**
 * The status shown for a dose. A recorded status always wins. Otherwise the dose is "upcoming" before
 * its time, "pending" while reminders are going out, and "unconfirmed" once the escalation time has
 * passed. Saathi never assumes a dose was taken.
 */
export function doseStatus(
  scheduledFor: Date,
  logStatus: DoseLogStatus | null | undefined,
  now: Date,
  escalateAfterMinutes: number,
): DoseStatus {
  if (logStatus) return logStatus;
  const minutesLate = (now.getTime() - scheduledFor.getTime()) / 60_000;
  if (minutesLate < 0) return "upcoming";
  if (minutesLate < escalateAfterMinutes) return "pending";
  return "unconfirmed";
}

/** Stable key for one dose of one medication. */
export function doseKey(medicationId: string, scheduledFor: Date): string {
  return `${medicationId}@${scheduledFor.toISOString()}`;
}

export function summarizeAdherence(statuses: DoseStatus[]): AdherenceSummary {
  const counts = { taken: 0, skipped: 0, missed: 0, unconfirmed: 0, pending: 0 };
  for (const status of statuses) {
    if (status !== "upcoming") counts[status]++;
  }
  const total = counts.taken + counts.skipped + counts.missed + counts.unconfirmed;
  return { ...counts, total, rate: total ? Math.round((counts.taken / total) * 100) : null };
}

export type DayPart = "morning" | "afternoon" | "evening" | "night";

export function dayPart(localTime: string): DayPart {
  const hour = Number(localTime.slice(0, 2));
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}

export { formatTime12h } from "./format";

/** "2026-11-15" -> "Sun, 15 Nov" */
export function formatLocalDate(localDate: string, withYear = false): string {
  return DateTime.fromISO(localDate).toFormat(withYear ? "ccc, d LLL yyyy" : "ccc, d LLL");
}

/** "2026-11-15" -> "Sunday, 15 November" (used for read-aloud). */
export function formatLongDate(localDate: string): string {
  return DateTime.fromISO(localDate).toFormat("cccc, d LLLL");
}

/** Clock time of an instant in a timezone, e.g. "8:05 AM". */
export function formatClock(instant: Date, zone: string): string {
  return DateTime.fromJSDate(instant, { zone }).toFormat("h:mm a");
}

/** Formats an instant in a timezone, e.g. "Mon, 16 Nov · 10:30 AM". */
export function formatInstant(instant: Date, zone: string): string {
  return DateTime.fromJSDate(instant, { zone }).toFormat("ccc, d LLL · h:mm a");
}

/** Human summary of a schedule, e.g. "Daily · 8:00 AM, 8:00 PM" or "Mon, Wed · 9:00 AM". */
export function describeSchedule(med: Pick<ScheduleLike, "times" | "frequency" | "daysOfWeek">): string {
  const times = [...med.times].sort().map(formatTime12h).join(", ");
  if (med.frequency === "daily" || med.daysOfWeek.length === 7) return `Daily · ${times}`;
  const names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const days = [...med.daysOfWeek].sort().map((day) => names[day - 1]).join(", ");
  return `${days} · ${times}`;
}
