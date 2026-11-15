// Pure calculations behind the Health insights page and the weekly family email. No database or
// framework imports, so every number here is unit tested. Saathi describes routines only: nothing in
// this file diagnoses, judges or suggests changing a medicine.
import { DateTime } from "luxon";
import type { AlertStatus, DoseStatus } from "./constants";
import {
  dayPart,
  formatLocalDate,
  formatTime12h,
  shiftDate,
  summarizeAdherence,
  type AdherenceSummary,
  type DayPart,
} from "./schedule";
import type { AlertDTO, AppointmentDTO, DoseItem } from "./types";

/** The insights look at one week, compared with the week before. */
export const WEEK_DAYS = 7;
/** Patterns and "frequently missed" look further back, so one bad day isn't called a pattern. */
export const PATTERN_DAYS = 28;

const DAY_PARTS: readonly DayPart[] = ["morning", "afternoon", "evening", "night"];
const DAY_PART_LABELS: Record<DayPart, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
  night: "Night",
};
const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** Thresholds for calling something a pattern (see `standOut`). */
const WEEKLY_PATTERN = { minNotTaken: 2, minCounted: 3 };
const RECURRING_PATTERN = { minNotTaken: 3, minCounted: 5 };

export interface DayTrend {
  date: string;
  /** "Mon, 10 Nov" */
  label: string;
  /** "Mon" */
  weekday: string;
  summary: AdherenceSummary;
  /** Every dose expected that day, including pending and upcoming ones. */
  scheduled: number;
  upcoming: number;
}

export interface PeriodStats {
  from: string;
  to: string;
  summary: AdherenceSummary;
  /** Every dose expected in the period, including pending and upcoming ones. */
  scheduled: number;
  upcoming: number;
  days: DayTrend[];
}

/** One medicine at one time of day, e.g. "Metformin 500 mg at 8:00 PM". */
export interface MissedDoseRow {
  key: string;
  medicationId: string;
  name: string;
  dosage: string;
  localTime: string;
  timeLabel: string;
  missed: number;
  unconfirmed: number;
  /** missed + unconfirmed */
  notTaken: number;
  /** Doses whose outcome counts (taken, skipped, missed or unconfirmed). */
  counted: number;
}

export interface PatternGroup {
  key: string;
  label: string;
  counted: number;
  notTaken: number;
  /** Percentage of counted doses that were missed or unconfirmed, or null with no data. */
  rate: number | null;
}

export interface PatternFinding {
  kind: "dayPart" | "weekday";
  key: string;
  label: string;
  notTaken: number;
  counted: number;
  othersNotTaken: number;
  othersCounted: number;
  text: string;
}

export interface PatternAnalysis {
  from: string;
  to: string;
  counted: number;
  notTaken: number;
  byDayPart: PatternGroup[];
  byWeekday: PatternGroup[];
  findings: PatternFinding[];
  /** Plain-language summary of what was (or couldn't be) found. */
  note: string;
}

export interface MedicationRow {
  medicationId: string;
  name: string;
  dosage: string;
  /** The insights week. */
  week: AdherenceSummary;
  /** The last 28 days. */
  month: AdherenceSummary;
}

/** One line of the week's dose grid: a medicine at a time, with the status on each day. */
export interface DoseHistoryRow {
  key: string;
  medicationId: string;
  name: string;
  dosage: string;
  localTime: string;
  timeLabel: string;
  /** One cell per day of the week; null when the dose wasn't scheduled that day. */
  cells: { date: string; status: DoseStatus | null }[];
}

export interface IncidentRow {
  id: string;
  slot: string;
  localDate: string;
  dateLabel: string;
  timeLabel: string;
  medicines: string[];
  status: AlertStatus;
  notifiedNames: string[];
  widened: boolean;
  acknowledgedByName: string | null;
  /** Minutes from the escalation to someone acknowledging it. */
  minutesToAcknowledge: number | null;
  resolvedByName: string | null;
  resolution: string | null;
}

export type InsightTone = "positive" | "neutral" | "attention";

export interface Insight {
  id: string;
  tone: InsightTone;
  text: string;
}

export interface InsightsReport {
  elderName: string;
  timezone: string;
  /** "rolling": the last 7 days up to today. "calendar": a finished Monday–Sunday week. */
  period: "rolling" | "calendar";
  generatedAt: string;
  week: PeriodStats;
  previousWeek: PeriodStats;
  /** Percentage points between this week's and the previous week's adherence, when both have data. */
  change: number | null;
  /** Doses due now and waiting for confirmation. */
  pendingNow: number;
  /** Over the last 28 days, most often missed or unconfirmed first. */
  frequentlyMissed: MissedDoseRow[];
  patterns: PatternAnalysis;
  medications: MedicationRow[];
  doseHistory: DoseHistoryRow[];
  /** Scheduled visits in the next 7 days. */
  upcomingAppointments: AppointmentDTO[];
  /** Escalations of the week, newest first. */
  incidents: IncidentRow[];
  insights: Insight[];
  /** How the numbers were worked out: period, counts and what was left out. */
  dataUsed: string[];
}

export interface InsightsInput {
  /** Dose items covering the 28 days that end on `endDate` (other dates are ignored). */
  doses: DoseItem[];
  /** The last local date of the week being described (today, or the Sunday of a finished week). */
  endDate: string;
  timezone: string;
  now: Date;
  elderName: string;
  appointments: AppointmentDTO[];
  alerts: AlertDTO[];
  period?: "rolling" | "calendar";
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const NUMBER_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

/** 2 -> "two", 14 -> "14"; optionally capitalised for the start of a sentence. */
export function countWord(count: number, capitalize = false): string {
  const word = Number.isInteger(count) && count >= 0 && count < NUMBER_WORDS.length ? NUMBER_WORDS[count] : String(count);
  return capitalize ? word.charAt(0).toUpperCase() + word.slice(1) : word;
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return count === 1 ? singular : pluralForm;
}

function percent(part: number, whole: number): number | null {
  return whole ? Math.round((part / whole) * 100) : null;
}

/** The `days` local dates ending on (and including) `endDate`, oldest first. */
export function datesEnding(endDate: string, days: number): string[] {
  return Array.from({ length: days }, (_, index) => shiftDate(endDate, index - (days - 1)));
}

function inDates(doses: DoseItem[], dates: string[]): DoseItem[] {
  const wanted = new Set(dates);
  return doses.filter((dose) => wanted.has(dose.localDate));
}

const notTakenOf = (summary: AdherenceSummary) => summary.missed + summary.unconfirmed;
const medicineLabel = (row: { name: string; dosage: string }) => [row.name, row.dosage].filter(Boolean).join(" ");

/** "Mon, 10 Nov – Sun, 16 Nov 2026" */
export function periodLabel(from: string, to: string): string {
  return `${formatLocalDate(from)} – ${formatLocalDate(to, true)}`;
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

export function periodStats(doses: DoseItem[], dates: string[]): PeriodStats {
  const items = inDates(doses, dates);
  const days = dates.map((date): DayTrend => {
    const dayItems = items.filter((dose) => dose.localDate === date);
    return {
      date,
      label: formatLocalDate(date),
      weekday: DateTime.fromISO(date).toFormat("ccc"),
      summary: summarizeAdherence(dayItems.map((dose) => dose.status)),
      scheduled: dayItems.length,
      upcoming: dayItems.filter((dose) => dose.status === "upcoming").length,
    };
  });
  return {
    from: dates[0],
    to: dates[dates.length - 1],
    summary: summarizeAdherence(items.map((dose) => dose.status)),
    scheduled: items.length,
    upcoming: items.filter((dose) => dose.status === "upcoming").length,
    days,
  };
}

/** Medicine-and-time combinations that were missed or left unconfirmed, worst first. */
export function frequentlyMissed(doses: DoseItem[]): MissedDoseRow[] {
  const groups = new Map<string, DoseItem[]>();
  for (const dose of doses) {
    const key = `${dose.medicationId}@${dose.localTime}`;
    groups.set(key, [...(groups.get(key) ?? []), dose]);
  }
  const rows: MissedDoseRow[] = [];
  for (const [key, items] of groups) {
    const summary = summarizeAdherence(items.map((dose) => dose.status));
    if (!notTakenOf(summary)) continue;
    const first = items[0];
    rows.push({
      key,
      medicationId: first.medicationId,
      name: first.name,
      dosage: first.dosage,
      localTime: first.localTime,
      timeLabel: formatTime12h(first.localTime),
      missed: summary.missed,
      unconfirmed: summary.unconfirmed,
      notTaken: notTakenOf(summary),
      counted: summary.total,
    });
  }
  return rows.sort(
    (a, b) =>
      b.notTaken - a.notTaken ||
      b.notTaken / b.counted - a.notTaken / a.counted ||
      a.localTime.localeCompare(b.localTime) ||
      a.name.localeCompare(b.name),
  );
}

function groupBy(doses: DoseItem[], keys: readonly string[], keyOf: (dose: DoseItem) => string, labelOf: (key: string) => string): PatternGroup[] {
  return keys.map((key) => {
    const summary = summarizeAdherence(doses.filter((dose) => keyOf(dose) === key).map((dose) => dose.status));
    return { key, label: labelOf(key), counted: summary.total, notTaken: notTakenOf(summary), rate: percent(notTakenOf(summary), summary.total) };
  });
}

const weekdayKey = (dose: DoseItem) => String(DateTime.fromISO(dose.localDate).weekday);

export function groupByDayPart(doses: DoseItem[]): PatternGroup[] {
  return groupBy(doses, DAY_PARTS, (dose) => dayPart(dose.localTime), (key) => DAY_PART_LABELS[key as DayPart]);
}

export function groupByWeekday(doses: DoseItem[]): PatternGroup[] {
  return groupBy(doses, ["1", "2", "3", "4", "5", "6", "7"], weekdayKey, (key) => WEEKDAY_NAMES[Number(key) - 1]);
}

/**
 * The group whose doses were missed or left unconfirmed clearly more often than the rest, or null.
 * "Clearly" means: enough misses to matter, at least 20 points and 1.5× worse than all other groups
 * together, and no close runner-up (so two equally bad groups are never presented as one pattern).
 */
export function standOut(
  groups: PatternGroup[],
  thresholds: { minNotTaken: number; minCounted: number },
): { group: PatternGroup; othersNotTaken: number; othersCounted: number } | null {
  const ratio = (group: { notTaken: number; counted: number }) => (group.counted ? group.notTaken / group.counted : 0);
  const eligible = groups
    .filter((group) => group.notTaken >= thresholds.minNotTaken && group.counted >= thresholds.minCounted)
    .sort((a, b) => ratio(b) - ratio(a) || b.notTaken - a.notTaken);
  const best = eligible[0];
  if (!best) return null;

  const others = groups.filter((group) => group.key !== best.key);
  const othersNotTaken = others.reduce((sum, group) => sum + group.notTaken, 0);
  const othersCounted = others.reduce((sum, group) => sum + group.counted, 0);
  if (!othersCounted) return null; // nothing to compare with

  const othersRatio = othersNotTaken / othersCounted;
  if (ratio(best) < othersRatio + 0.2 || ratio(best) < othersRatio * 1.5) return null;

  const runnerUp = others.filter((group) => group.counted >= thresholds.minCounted).sort((a, b) => ratio(b) - ratio(a))[0];
  if (runnerUp && ratio(runnerUp) > ratio(best) - 0.1) return null;

  return { group: best, othersNotTaken, othersCounted };
}

function analysePatterns(doses: DoseItem[], dates: string[]): PatternAnalysis {
  const items = inDates(doses, dates);
  const summary = summarizeAdherence(items.map((dose) => dose.status));
  const byDayPart = groupByDayPart(items);
  const byWeekday = groupByWeekday(items);
  const findings: PatternFinding[] = [];
  const span = dates.length === PATTERN_DAYS ? "Over the last 4 weeks" : `Over the last ${dates.length} days`;

  const partPattern = standOut(byDayPart, RECURRING_PATTERN);
  if (partPattern) {
    const { group, othersNotTaken, othersCounted } = partPattern;
    findings.push({
      kind: "dayPart",
      key: group.key,
      label: group.label,
      notTaken: group.notTaken,
      counted: group.counted,
      othersNotTaken,
      othersCounted,
      text: `${span}, ${group.label.toLowerCase()} doses were missed or left unconfirmed more often than doses at other times of day (${group.notTaken} of ${group.counted}, compared with ${othersNotTaken} of ${othersCounted}).`,
    });
  }
  const dayPattern = standOut(byWeekday, RECURRING_PATTERN);
  if (dayPattern) {
    const { group, othersNotTaken, othersCounted } = dayPattern;
    findings.push({
      kind: "weekday",
      key: group.key,
      label: group.label,
      notTaken: group.notTaken,
      counted: group.counted,
      othersNotTaken,
      othersCounted,
      text: `${span}, doses on ${group.label}s were missed or left unconfirmed more often than on other days (${group.notTaken} of ${group.counted}, compared with ${othersNotTaken} of ${othersCounted}).`,
    });
  }

  const notTaken = notTakenOf(summary);
  let note: string;
  if (!summary.total) note = `No doses were due in this period, so there are no patterns to look for yet.`;
  else if (!notTaken) note = `No doses were missed or left unconfirmed in this period, so there is no pattern to report.`;
  else if (notTaken < RECURRING_PATTERN.minNotTaken) {
    note = `Only ${countWord(notTaken)} ${plural(notTaken, "dose was", "doses were")} missed or left unconfirmed in this period: too few to call a pattern.`;
  } else if (findings.length) {
    note = `Based on ${notTaken} missed or unconfirmed ${plural(notTaken, "dose")} out of ${summary.total} counted.`;
  } else note = `No clear pattern: the ${notTaken} missed or unconfirmed doses were spread across different times and days.`;

  return { from: dates[0], to: dates[dates.length - 1], counted: summary.total, notTaken, byDayPart, byWeekday, findings, note };
}

function medicationRows(weekDoses: DoseItem[], monthDoses: DoseItem[]): MedicationRow[] {
  const byMed = new Map<string, { name: string; dosage: string; week: DoseItem[]; month: DoseItem[] }>();
  for (const dose of monthDoses) {
    const row = byMed.get(dose.medicationId) ?? { name: dose.name, dosage: dose.dosage, week: [], month: [] };
    row.month.push(dose);
    byMed.set(dose.medicationId, row);
  }
  for (const dose of weekDoses) byMed.get(dose.medicationId)?.week.push(dose);
  return [...byMed.entries()]
    .map(([medicationId, row]) => ({
      medicationId,
      name: row.name,
      dosage: row.dosage,
      week: summarizeAdherence(row.week.map((dose) => dose.status)),
      month: summarizeAdherence(row.month.map((dose) => dose.status)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.dosage.localeCompare(b.dosage));
}

function doseHistory(weekDoses: DoseItem[], dates: string[]): DoseHistoryRow[] {
  const rows = new Map<string, DoseHistoryRow>();
  for (const dose of weekDoses) {
    const key = `${dose.medicationId}@${dose.localTime}`;
    const row =
      rows.get(key) ??
      ({
        key,
        medicationId: dose.medicationId,
        name: dose.name,
        dosage: dose.dosage,
        localTime: dose.localTime,
        timeLabel: formatTime12h(dose.localTime),
        cells: dates.map((date) => ({ date, status: null })),
      } satisfies DoseHistoryRow);
    const cell = row.cells.find((entry) => entry.date === dose.localDate);
    if (cell) cell.status = dose.status;
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => a.localTime.localeCompare(b.localTime) || a.name.localeCompare(b.name));
}

function toIncident(alert: AlertDTO): IncidentRow {
  const minutesToAcknowledge = alert.acknowledgedAt
    ? Math.max(0, Math.round((new Date(alert.acknowledgedAt).getTime() - new Date(alert.escalatedAt).getTime()) / 60_000))
    : null;
  return {
    id: alert.id,
    slot: alert.slot,
    localDate: alert.localDate,
    dateLabel: formatLocalDate(alert.localDate),
    timeLabel: formatTime12h(alert.localTime),
    medicines: alert.medicines,
    status: alert.status,
    notifiedNames: alert.notifiedNames,
    widened: Boolean(alert.widenedAt),
    acknowledgedByName: alert.acknowledgedByName,
    minutesToAcknowledge,
    resolvedByName: alert.resolvedByName,
    resolution: alert.resolution,
  };
}

function listWithAnd(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

// ---------------------------------------------------------------------------
// Plain-language insights (every sentence states its numbers)
// ---------------------------------------------------------------------------

type ReportWithoutText = Omit<InsightsReport, "insights" | "dataUsed">;

function buildInsights(report: ReportWithoutText, weekDoses: DoseItem[]): Insight[] {
  const { week, previousWeek, elderName } = report;
  const thisWeek = report.period === "rolling" ? "this week" : "last week";
  const weekBefore = report.period === "rolling" ? "the week before" : "the week before that";
  const insights: Insight[] = [];
  const s = week.summary;

  if (!week.scheduled) {
    insights.push({ id: "no-doses", tone: "neutral", text: `No medicines were scheduled for ${elderName} ${thisWeek}.` });
  } else if (!s.total) {
    insights.push({ id: "nothing-counted", tone: "neutral", text: `None of ${thisWeek}’s doses have been due long enough to count yet.` });
  } else if (s.rate === 100) {
    insights.push({ id: "adherence", tone: "positive", text: `${elderName} took every dose ${thisWeek} (${s.taken} of ${s.total}).` });
  } else {
    insights.push({
      id: "adherence",
      tone: (s.rate ?? 0) >= 90 ? "positive" : (s.rate ?? 0) >= 70 ? "neutral" : "attention",
      text: `${elderName}’s medication adherence ${thisWeek} was ${s.rate}% (${s.taken} of ${s.total} ${plural(s.total, "dose")} taken).`,
    });
  }

  if (report.change !== null && previousWeek.summary.rate !== null) {
    const points = Math.abs(report.change);
    insights.push(
      report.change === 0
        ? { id: "trend", tone: "neutral", text: `That’s the same as ${weekBefore} (${previousWeek.summary.rate}%).` }
        : {
            id: "trend",
            tone: report.change > 0 ? "positive" : "attention",
            text: `That’s ${points} ${plural(points, "point")} ${report.change > 0 ? "higher" : "lower"} than ${weekBefore} (${previousWeek.summary.rate}%).`,
          },
    );
  }

  if (s.unconfirmed) {
    insights.push({
      id: "unconfirmed",
      tone: "attention",
      text: `${countWord(s.unconfirmed, true)} scheduled ${plural(s.unconfirmed, "dose")} ${thisWeek} ${plural(s.unconfirmed, "remains", "remain")} unconfirmed: nobody recorded whether ${plural(s.unconfirmed, "it was", "they were")} taken.`,
    });
  }
  if (s.missed) {
    insights.push({
      id: "missed",
      tone: "attention",
      text: `${countWord(s.missed, true)} ${plural(s.missed, "dose was", "doses were")} recorded as missed ${thisWeek}.`,
    });
  }
  if (report.period === "rolling" && report.pendingNow) {
    insights.push({
      id: "pending",
      tone: "neutral",
      text: `${countWord(report.pendingNow, true)} ${plural(report.pendingNow, "dose is", "doses are")} waiting to be confirmed right now.`,
    });
  }

  if (notTakenOf(s)) {
    const weeklyPart = standOut(groupByDayPart(weekDoses), WEEKLY_PATTERN);
    if (weeklyPart) {
      insights.push({
        id: "week-pattern",
        tone: "attention",
        text: `${weeklyPart.group.label} doses were missed or left unconfirmed more often than other times ${thisWeek} (${weeklyPart.group.notTaken} of ${weeklyPart.group.counted}).`,
      });
    } else {
      const worst = frequentlyMissed(weekDoses)[0];
      if (worst && worst.notTaken >= 2) {
        insights.push({
          id: "week-dose",
          tone: "attention",
          text: `${medicineLabel(worst)} at ${worst.timeLabel} was missed or left unconfirmed ${worst.notTaken} times ${thisWeek} (out of ${worst.counted}).`,
        });
      }
    }
  }

  for (const finding of report.patterns.findings) {
    insights.push({ id: `pattern-${finding.kind}`, tone: "attention", text: finding.text });
  }

  if (s.skipped) {
    insights.push({
      id: "skipped",
      tone: "neutral",
      text: `${countWord(s.skipped, true)} ${plural(s.skipped, "dose was", "doses were")} skipped ${thisWeek}.`,
    });
  }

  if (report.incidents.length) {
    const total = report.incidents.length;
    const open = report.incidents.filter((incident) => incident.status === "open").length;
    const acknowledged = report.incidents.filter((incident) => incident.minutesToAcknowledge !== null);
    const average = acknowledged.length
      ? Math.round(acknowledged.reduce((sum, incident) => sum + (incident.minutesToAcknowledge ?? 0), 0) / acknowledged.length)
      : null;
    let text = `Saathi sent ${countWord(total)} escalation ${plural(total, "alert")} ${thisWeek} for doses nobody confirmed in time.`;
    if (acknowledged.length === total && average !== null) {
      text +=
        total === 1
          ? ` Someone followed up ${average} ${plural(average, "minute")} after the alert.`
          : ` Someone followed up every time, on average ${average} ${plural(average, "minute")} after the alert.`;
    } else if (open) {
      text += ` ${countWord(open, true)} ${plural(open, "alert is", "alerts are")} still waiting for someone to follow up.`;
    } else if (acknowledged.length) {
      text += ` ${countWord(acknowledged.length, true)} of them ${plural(acknowledged.length, "was", "were")} acknowledged by someone in the care circle.`;
    }
    insights.push({ id: "escalations", tone: open ? "attention" : "neutral", text });
  }

  const visits = report.upcomingAppointments;
  if (visits.length) {
    const describeVisit = (visit: AppointmentDTO) =>
      `${visit.doctorName} on ${DateTime.fromISO(visit.dateTime, { zone: report.timezone }).toFormat("ccc, d LLL")}`;
    insights.push({
      id: "appointments",
      tone: "neutral",
      text:
        visits.length === 1
          ? `One doctor appointment is coming up in the next 7 days: ${describeVisit(visits[0])}.`
          : `${countWord(visits.length, true)} doctor appointments are coming up in the next 7 days: ${listWithAnd(visits.slice(0, 3).map(describeVisit))}${visits.length > 3 ? " and more" : ""}.`,
    });
  }

  return insights;
}

function buildDataUsed(report: ReportWithoutText): string[] {
  const { week, patterns } = report;
  const s = week.summary;
  const lines = [
    `Period: ${periodLabel(week.from, week.to)} (${report.period === "rolling" ? "the last 7 days, including today" : "Monday to Sunday"}), in ${report.timezone} time. Compared with ${periodLabel(report.previousWeek.from, report.previousWeek.to)}.`,
    s.total
      ? `${s.total} scheduled ${plural(s.total, "dose")} counted: ${s.taken} taken, ${s.skipped} skipped, ${s.missed} missed and ${s.unconfirmed} unconfirmed.`
      : "No doses were due long enough to be counted.",
  ];
  const notYet = [
    s.pending ? `${s.pending} pending ${plural(s.pending, "dose")}` : null,
    week.upcoming ? `${week.upcoming} upcoming ${plural(week.upcoming, "dose")}` : null,
  ].filter(Boolean);
  if (notYet.length) lines.push(`Not counted yet: ${notYet.join(" and ")}.`);
  lines.push(
    "Adherence is the share of counted doses that were taken. Skipped, missed and unconfirmed doses count as not taken.",
    "“Missed” means someone recorded that the dose wasn’t taken; “unconfirmed” means nobody recorded anything by the escalation time. Saathi never marks a dose as taken by itself.",
    `Patterns and frequently missed doses use ${periodLabel(patterns.from, patterns.to)}: ${patterns.counted} ${plural(patterns.counted, "dose")} counted.`,
    "Doses from before a medicine was added or its schedule changed are not expected, so they never count against anyone.",
  );
  if (report.incidents.length) {
    lines.push(`${report.incidents.length} escalation ${plural(report.incidents.length, "alert")} in this period.`);
  }
  return lines;
}

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

export function computeInsights(input: InsightsInput): InsightsReport {
  const period = input.period ?? "rolling";
  const weekDates = datesEnding(input.endDate, WEEK_DAYS);
  const previousDates = datesEnding(shiftDate(input.endDate, -WEEK_DAYS), WEEK_DAYS);
  const patternDates = datesEnding(input.endDate, PATTERN_DAYS);

  const week = periodStats(input.doses, weekDates);
  const previousWeek = periodStats(input.doses, previousDates);
  const change =
    week.summary.rate !== null && previousWeek.summary.rate !== null ? week.summary.rate - previousWeek.summary.rate : null;
  const weekDoses = inDates(input.doses, weekDates);
  const monthDoses = inDates(input.doses, patternDates);

  const nowMs = input.now.getTime();
  const horizon = nowMs + 7 * 24 * 60 * 60 * 1000;
  const upcomingAppointments = input.appointments
    .filter((visit) => {
      const at = new Date(visit.dateTime).getTime();
      return visit.status === "scheduled" && at >= nowMs && at < horizon;
    })
    .sort((a, b) => a.dateTime.localeCompare(b.dateTime));

  const weekSet = new Set(weekDates);
  const incidents = input.alerts
    .filter((alert) => weekSet.has(alert.localDate))
    .sort((a, b) => b.slot.localeCompare(a.slot))
    .map(toIncident);

  const base: ReportWithoutText = {
    elderName: input.elderName,
    timezone: input.timezone,
    period,
    generatedAt: input.now.toISOString(),
    week,
    previousWeek,
    change,
    pendingNow: week.summary.pending,
    frequentlyMissed: frequentlyMissed(monthDoses).slice(0, 5),
    patterns: analysePatterns(input.doses, patternDates),
    medications: medicationRows(weekDoses, monthDoses),
    doseHistory: doseHistory(weekDoses, weekDates),
    upcomingAppointments,
    incidents,
  };
  return { ...base, insights: buildInsights(base, weekDoses), dataUsed: buildDataUsed(base) };
}

/** A short plain-text summary from the rule-based insights (also the fallback for the AI summary). */
export function ruleBasedSummary(report: InsightsReport, maxSentences = 4): string {
  return report.insights
    .slice(0, maxSentences)
    .map((insight) => insight.text)
    .join(" ");
}

// ---------------------------------------------------------------------------
// The optional AI summary: facts in, safety checks out
// ---------------------------------------------------------------------------

/** Everything the AI is allowed to see: numbers and medicine/time labels only, never anyone's name or email. */
export interface AiFacts {
  period: string;
  dosesCounted: number;
  taken: number;
  skipped: number;
  missed: number;
  unconfirmed: number;
  pendingNow: number;
  adherencePercent: number | null;
  previousWeekAdherencePercent: number | null;
  changeInPoints: number | null;
  mostOftenNotTaken: { medicine: string; time: string; notTaken: number; counted: number }[];
  patterns: string[];
  escalations: { total: number; acknowledged: number; stillOpen: number; averageMinutesToAcknowledge: number | null };
  upcomingAppointments: number;
}

export function buildAiFacts(report: InsightsReport): AiFacts {
  const s = report.week.summary;
  const acknowledged = report.incidents.filter((incident) => incident.minutesToAcknowledge !== null);
  return {
    period: periodLabel(report.week.from, report.week.to),
    dosesCounted: s.total,
    taken: s.taken,
    skipped: s.skipped,
    missed: s.missed,
    unconfirmed: s.unconfirmed,
    pendingNow: report.pendingNow,
    adherencePercent: s.rate,
    previousWeekAdherencePercent: report.previousWeek.summary.rate,
    changeInPoints: report.change,
    mostOftenNotTaken: report.frequentlyMissed.slice(0, 3).map((row) => ({
      medicine: medicineLabel(row),
      time: row.timeLabel,
      notTaken: row.notTaken,
      counted: row.counted,
    })),
    patterns: report.patterns.findings.map((finding) => finding.text),
    escalations: {
      total: report.incidents.length,
      acknowledged: acknowledged.length,
      stillOpen: report.incidents.filter((incident) => incident.status === "open").length,
      averageMinutesToAcknowledge: acknowledged.length
        ? Math.round(acknowledged.reduce((sum, incident) => sum + (incident.minutesToAcknowledge ?? 0), 0) / acknowledged.length)
        : null,
    },
    upcomingAppointments: report.upcomingAppointments.length,
  };
}

/** Phrases that would turn a routine summary into advice or a medical claim. */
const UNSAFE_PATTERNS = [
  /\b(should|must|ought to|needs? to|have to|recommend|advis|consult|suggest)/i,
  /\b(talk|speak) (to|with) (the|your|a|their|his|her) (doctor|physician|pharmacist)/i,
  /\b(stop|start|keep) taking\b/i,
  /\b(increas|decreas|reduc|doubl|halv|chang|adjust|switch)\w*\s+(the\s+|their\s+|his\s+|her\s+|your\s+|a\s+)?(dose|dosage|medicine|medication|tablet|pill|treatment)/i,
  /\b(diagnos|disease|illness|symptom|side[- ]?effect|overdose|blood pressure|blood sugar|diabet|hypertens|cholesterol|heart|kidney|liver|cancer|dementia)/i,
  /\b(cure|therapy|risk|dangerous|harmful|healthy|unhealthy)\b/i,
  /https?:\/\/|www\.|@/i,
];

/**
 * Checks an AI-written summary before anyone sees it: short, no advice or medical claims, no links,
 * and no number that isn't in the facts it was given (so it can't invent figures).
 */
export function isSafeAiSummary(text: string, facts: AiFacts): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 30 || trimmed.length > 600) return false;
  const sentences = trimmed.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length > 5) return false;
  if (UNSAFE_PATTERNS.some((pattern) => pattern.test(trimmed))) return false;

  const allowed = new Set([...(JSON.stringify(facts).match(/\d+/g) ?? []), "7", "4", "28", "100"]);
  const used = trimmed.match(/\d+/g) ?? [];
  return used.every((number) => allowed.has(number) || allowed.has(String(Number(number))));
}
