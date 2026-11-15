// Loads the real dose records, alerts and appointments behind the Health insights page and the
// weekly family email, then hands them to the pure calculations in insights-core.ts.
// Callers must authorize first (see lib/auth/dal.ts).
import "server-only";
import { DateTime } from "luxon";
import { getAlerts, getAppointments, getDoseItems } from "./data";
import { computeInsights, datesEnding, PATTERN_DAYS, periodLabel, WEEK_DAYS, type InsightsReport } from "./insights-core";
import { formatLocalDate, shiftDate, todayInZone, zonedToUtc } from "./schedule";
import type { ProfileDTO } from "./types";

async function loadReport(
  profile: ProfileDTO,
  endDate: string,
  now: Date,
  period: InsightsReport["period"],
): Promise<InsightsReport> {
  // One query covers the 28 days used for patterns, which include both weeks.
  const dates = datesEnding(endDate, PATTERN_DAYS);
  const weekStart = shiftDate(endDate, -(WEEK_DAYS - 1));
  const [doses, alerts, appointments] = await Promise.all([
    getDoseItems(profile, dates, now),
    getAlerts(profile.id, {
      since: zonedToUtc(weekStart, "00:00", profile.timezone),
      until: zonedToUtc(shiftDate(endDate, 1), "00:00", profile.timezone),
      limit: 200,
    }),
    getAppointments(profile.id, now),
  ]);
  return computeInsights({
    doses,
    endDate,
    timezone: profile.timezone,
    now,
    elderName: profile.name,
    appointments: appointments.upcoming,
    alerts,
    period,
  });
}

/** Insights for the last 7 days, including today, compared with the 7 days before. */
export async function getInsights(profile: ProfileDTO, now: Date = new Date()): Promise<InsightsReport> {
  return loadReport(profile, todayInZone(profile.timezone, now), now, "rolling");
}

export interface WeeklySummary {
  /** ISO week of the summarised week, e.g. "2026-W46". Use it to send the email once per week. */
  weekId: string;
  /** Monday and Sunday of the summarised week (YYYY-MM-DD, in the profile's timezone). */
  from: string;
  to: string;
  fromLabel: string;
  toLabel: string;
  /** "Mon, 10 Nov – Sun, 16 Nov 2026" */
  periodLabel: string;
  elderName: string;
  /** False when nothing was scheduled that week (no point sending an email). */
  hasData: boolean;
  report: InsightsReport;
}

/**
 * The previous full Monday–Sunday week in the profile's timezone, for the weekly family email.
 * (On a Monday, that's the week that just ended.)
 */
export async function buildWeeklySummary(profile: ProfileDTO, now: Date = new Date()): Promise<WeeklySummary> {
  const today = DateTime.fromISO(todayInZone(profile.timezone, now));
  const thisMonday = today.startOf("week");
  const monday = thisMonday.minus({ weeks: 1 });
  const sunday = thisMonday.minus({ days: 1 });
  const from = monday.toISODate() ?? "";
  const to = sunday.toISODate() ?? "";
  const report = await loadReport(profile, to, now, "calendar");
  return {
    weekId: monday.toFormat("kkkk-'W'WW"),
    from,
    to,
    fromLabel: formatLocalDate(from),
    toLabel: formatLocalDate(to),
    periodLabel: periodLabel(from, to),
    elderName: profile.name,
    hasData: report.week.scheduled > 0,
    report,
  };
}
