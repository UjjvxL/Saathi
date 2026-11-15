// Read-side queries used by pages. Callers must authorize first (see lib/auth/dal.ts).
import "server-only";
import mongoose from "mongoose";
import { DOSE_LOG_STATUSES, type DoseLogStatus } from "./constants";
import { connectDB } from "./db";
import {
  toActivityDTO,
  toAlertDTO,
  toAppointmentDTO,
  toMedicationDTO,
  toMembershipDTO,
  toProfileDTO,
  toSchedule,
} from "./dto";
import { Activity, Alert, Appointment, DoseLog, Medication, Membership, Profile, User } from "./models";
import {
  doseKey,
  doseStatus,
  dosesForDate,
  formatTime12h,
  shiftDate,
  summarizeAdherence,
  todayInZone,
  zonedToUtc,
  type AdherenceSummary,
} from "./schedule";
import type {
  ActivityDTO,
  AlertDTO,
  AppointmentDTO,
  DoseAlertInfo,
  DoseItem,
  MedicationDTO,
  MemberDTO,
  MembershipDTO,
  ProfileDTO,
} from "./types";
import type { ActivityKind, AlertStatus } from "./constants";

function asLogStatus(value: unknown): DoseLogStatus | null {
  return DOSE_LOG_STATUSES.includes(value as DoseLogStatus) ? (value as DoseLogStatus) : null;
}

export function isLowStock(med: MedicationDTO): boolean {
  return med.active && med.stock !== null && med.refillThreshold !== null && med.stock <= med.refillThreshold;
}

export async function getMedications(profileId: string): Promise<MedicationDTO[]> {
  await connectDB();
  const docs = await Medication.find({ profileId }).sort({ active: -1, name: 1 }).lean();
  return docs.map(toMedicationDTO);
}

export async function getMedication(profileId: string, medicationId: string): Promise<MedicationDTO | null> {
  if (!mongoose.isValidObjectId(medicationId)) return null;
  await connectDB();
  const doc = await Medication.findOne({ _id: medicationId, profileId }).lean();
  return doc ? toMedicationDTO(doc) : null;
}

/**
 * Doses for the given local dates: everything the active schedules expect, merged with what was
 * actually logged (including logs for medicines that were stopped or rescheduled since).
 */
export async function getDoseItems(
  profile: ProfileDTO,
  localDates: string[],
  now: Date = new Date(),
  medications?: MedicationDTO[],
): Promise<DoseItem[]> {
  await connectDB();
  const meds = medications ?? (await getMedications(profile.id));
  const medById = new Map(meds.map((med) => [med.id, med]));
  const schedules = meds.filter((med) => med.active).map(toSchedule);
  const [logs, alerts] = await Promise.all([
    DoseLog.find({ profileId: profile.id, localDate: { $in: localDates } }).lean(),
    Alert.find({ profileId: profile.id, localDate: { $in: localDates } })
      .select("slot medicationIds status acknowledgedByName acknowledgedAt")
      .lean(),
  ]);
  const logByKey = new Map(logs.map((log) => [doseKey(log.medicationId.toString(), log.scheduledFor), log]));
  const alertByKey = new Map<string, DoseAlertInfo>();
  for (const alert of alerts) {
    const info: DoseAlertInfo = {
      id: alert._id.toString(),
      status: alert.status as AlertStatus,
      acknowledgedByName: alert.acknowledgedByName ?? null,
      acknowledgedAt: alert.acknowledgedAt ? alert.acknowledgedAt.toISOString() : null,
    };
    for (const medicationId of alert.medicationIds) alertByKey.set(doseKey(medicationId.toString(), alert.slot), info);
  }

  const items: DoseItem[] = [];
  const seen = new Set<string>();

  const add = (medicationId: string, localDate: string, localTime: string, scheduledFor: Date) => {
    const med = medById.get(medicationId);
    const key = doseKey(medicationId, scheduledFor);
    if (!med || seen.has(key)) return;
    seen.add(key);
    const log = logByKey.get(key);
    const status = doseStatus(scheduledFor, asLogStatus(log?.status), now, profile.escalateAfterMinutes);
    const hoursAhead = (scheduledFor.getTime() - now.getTime()) / 3_600_000;
    items.push({
      key,
      medicationId,
      name: med.name,
      dosage: med.dosage,
      form: med.form,
      instructions: med.instructions,
      localDate,
      localTime,
      scheduledFor: scheduledFor.toISOString(),
      status,
      canMark: med.active && hoursAhead <= 2 && hoursAhead >= -24 * 7,
      takenAt: log?.takenAt ? log.takenAt.toISOString() : null,
      loggedByName: log?.loggedByName ?? null,
      loggedAt: log?.updatedAt ? log.updatedAt.toISOString() : null,
      assigneeId: med.assigneeId,
      alert: alertByKey.get(key) ?? null,
    });
  };

  for (const localDate of localDates) {
    for (const dose of dosesForDate(schedules, localDate, profile.timezone)) {
      add(dose.medicationId, dose.localDate, dose.localTime, dose.scheduledFor);
    }
  }
  for (const log of logs) add(log.medicationId.toString(), log.localDate, log.localTime, log.scheduledFor);

  return items.sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor) || a.name.localeCompare(b.name));
}

export interface TodayOverview {
  today: string;
  doses: DoseItem[];
  summary: AdherenceSummary;
  /** Doses due now and waiting for confirmation. */
  pendingCount: number;
  nextAppointments: AppointmentDTO[];
  lowStock: MedicationDTO[];
}

export async function getTodayOverview(profile: ProfileDTO, now: Date = new Date()): Promise<TodayOverview> {
  const today = todayInZone(profile.timezone, now);
  const meds = await getMedications(profile.id);
  const [doses, appointments] = await Promise.all([
    getDoseItems(profile, [today], now, meds),
    Appointment.find({ profileId: profile.id, status: "scheduled", dateTime: { $gte: now } })
      .sort({ dateTime: 1 })
      .limit(3)
      .lean(),
  ]);
  return {
    today,
    doses,
    summary: summarizeAdherence(doses.map((dose) => dose.status)),
    pendingCount: doses.filter((dose) => dose.status === "pending").length,
    nextAppointments: appointments.map(toAppointmentDTO),
    lowStock: meds.filter(isLowStock),
  };
}

export interface DashboardEntry {
  profile: ProfileDTO;
  membership: MembershipDTO;
  totalToday: number;
  takenToday: number;
  /** Doses due now and waiting for confirmation. */
  pendingNow: number;
  /** Doses today that were missed or left unconfirmed. */
  notTakenToday: number;
  nextAppointment: AppointmentDTO | null;
  lowStockCount: number;
  /** Escalations from the last 48 hours that nobody has acknowledged yet. */
  waitingAlerts: number;
}

export async function getDashboard(userId: string, now: Date = new Date()): Promise<DashboardEntry[]> {
  await connectDB();
  const memberships = await Membership.find({ userId }).lean();
  if (!memberships.length) return [];
  const profiles = await Profile.find({ _id: { $in: memberships.map((m) => m.profileId) } }).lean();

  const entries = await Promise.all(
    profiles.map(async (doc): Promise<DashboardEntry | null> => {
      const profile = toProfileDTO(doc);
      const membership = memberships.find((m) => m.profileId.toString() === profile.id);
      if (!membership) return null;
      const [overview, waitingAlerts] = await Promise.all([
        getTodayOverview(profile, now),
        Alert.countDocuments({ profileId: profile.id, status: "open", slot: { $gte: new Date(now.getTime() - 48 * 60 * 60 * 1000) } }),
      ]);
      return {
        profile,
        membership: toMembershipDTO(membership),
        totalToday: overview.doses.length,
        takenToday: overview.summary.taken,
        pendingNow: overview.pendingCount,
        notTakenToday: overview.summary.missed + overview.summary.unconfirmed,
        nextAppointment: overview.nextAppointments[0] ?? null,
        lowStockCount: overview.lowStock.length,
        waitingAlerts,
      };
    }),
  );
  return entries
    .filter((entry): entry is DashboardEntry => entry !== null)
    .sort((a, b) => a.profile.name.localeCompare(b.profile.name));
}

export async function getAppointment(profileId: string, appointmentId: string): Promise<AppointmentDTO | null> {
  if (!mongoose.isValidObjectId(appointmentId)) return null;
  await connectDB();
  const doc = await Appointment.findOne({ _id: appointmentId, profileId }).lean();
  return doc ? toAppointmentDTO(doc) : null;
}

export async function getAppointments(
  profileId: string,
  now: Date = new Date(),
): Promise<{ upcoming: AppointmentDTO[]; past: AppointmentDTO[] }> {
  await connectDB();
  const docs = await Appointment.find({ profileId }).sort({ dateTime: 1 }).limit(200).lean();
  const all = docs.map(toAppointmentDTO);
  const cutoff = now.getTime() - 2 * 60 * 60 * 1000; // keep today's visits visible for 2 hours after
  const upcoming = all.filter((a) => a.status === "scheduled" && new Date(a.dateTime).getTime() >= cutoff);
  const upcomingIds = new Set(upcoming.map((a) => a.id));
  const past = all.filter((a) => !upcomingIds.has(a.id)).reverse();
  return { upcoming, past };
}

export interface HistoryReport {
  from: string;
  to: string;
  overall: AdherenceSummary;
  days: { date: string; summary: AdherenceSummary }[];
  byMedication: { medicationId: string; name: string; dosage: string; summary: AdherenceSummary }[];
  recentMisses: DoseItem[];
}

export async function getHistory(profile: ProfileDTO, days: number, now: Date = new Date()): Promise<HistoryReport> {
  const to = todayInZone(profile.timezone, now);
  const from = shiftDate(to, -(days - 1));
  const dates = Array.from({ length: days }, (_, index) => shiftDate(from, index));
  const items = await getDoseItems(profile, dates, now);

  const byMedication = new Map<string, DoseItem[]>();
  for (const item of items) byMedication.set(item.medicationId, [...(byMedication.get(item.medicationId) ?? []), item]);

  return {
    from,
    to,
    overall: summarizeAdherence(items.map((item) => item.status)),
    days: dates.map((date) => ({
      date,
      summary: summarizeAdherence(items.filter((item) => item.localDate === date).map((item) => item.status)),
    })),
    byMedication: [...byMedication.entries()]
      .map(([medicationId, doses]) => ({
        medicationId,
        name: doses[0].name,
        dosage: doses[0].dosage,
        summary: summarizeAdherence(doses.map((dose) => dose.status)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    recentMisses: items
      .filter((item) => item.status === "missed" || item.status === "unconfirmed")
      .reverse()
      .slice(0, 10),
  };
}

/** Escalated time slots, newest first. */
export async function getAlerts(
  profileId: string,
  options: { since?: Date; until?: Date; statuses?: AlertStatus[]; limit?: number } = {},
): Promise<AlertDTO[]> {
  await connectDB();
  const filter: Record<string, unknown> = { profileId };
  if (options.since || options.until) {
    filter.slot = { ...(options.since ? { $gte: options.since } : {}), ...(options.until ? { $lt: options.until } : {}) };
  }
  if (options.statuses?.length) filter.status = { $in: options.statuses };
  const docs = await Alert.find(filter)
    .sort({ slot: -1 })
    .limit(options.limit ?? 50)
    .lean();
  return docs.map(toAlertDTO);
}

/** Escalations from the last 48 hours that still need someone (open or being followed up). */
export async function getOutstandingAlerts(profileId: string, now: Date = new Date()): Promise<AlertDTO[]> {
  return getAlerts(profileId, {
    since: new Date(now.getTime() - 48 * 60 * 60 * 1000),
    statuses: ["open", "acknowledged"],
    limit: 10,
  });
}

export async function getActivity(profileId: string, limit = 40): Promise<ActivityDTO[]> {
  await connectDB();
  const docs = await Activity.find({ profileId }).sort({ createdAt: -1 }).limit(limit).lean();
  return docs.map(toActivityDTO);
}

export async function getMembers(profileId: string): Promise<MemberDTO[]> {
  await connectDB();
  const memberships = await Membership.find({ profileId }).sort({ createdAt: 1 }).lean();
  const users = await User.find({ _id: { $in: memberships.map((m) => m.userId) } })
    .select("name email")
    .lean();
  const userById = new Map(users.map((user) => [user._id.toString(), user]));
  return memberships.flatMap((membership) => {
    const user = userById.get(membership.userId.toString());
    if (!user) return [];
    return [
      {
        ...toMembershipDTO(membership),
        userId: user._id.toString(),
        name: user.name,
        email: user.email,
        joinedAt: (membership.createdAt ?? new Date(0)).toISOString(),
      },
    ];
  });
}

/** One thing someone in the circle is responsible for: a dose of their medicine, a visit, or an alert. */
export interface Responsibility {
  key: string;
  kind: "dose" | "appointment" | "alert";
  title: string;
  /** ISO instant it's due (or happened). */
  when: string;
  assigneeId: string | null;
  assigneeName: string | null;
  /** The dose, appointment or alert status. */
  status: string;
  doneByName: string | null;
  doneAt: string | null;
}

export interface CareCircleOverview {
  members: MemberDTO[];
  /** Open or acknowledged alerts from the last 48 hours. */
  openAlerts: AlertDTO[];
  pending: Responsibility[];
  /** Done today (doses, follow-ups) or in the last 7 days (visits). */
  completed: Responsibility[];
  unassignedMedicines: MedicationDTO[];
  /** userId -> what they're responsible for. */
  assignments: Record<string, string[]>;
  recentActivity: ActivityDTO[];
  /** Whether the current passcode has expired or was turned off. */
  inviteExpired: boolean;
}

const HOUR = 60 * 60 * 1000;

export async function getCareCircleOverview(profile: ProfileDTO, now: Date = new Date()): Promise<CareCircleOverview> {
  await connectDB();
  const today = todayInZone(profile.timezone, now);
  const [members, meds, appointmentDocs, alertDocs, recentActivity] = await Promise.all([
    getMembers(profile.id),
    getMedications(profile.id),
    Appointment.find({
      profileId: profile.id,
      assigneeId: { $ne: null },
      dateTime: { $gte: new Date(now.getTime() - 7 * 24 * HOUR), $lte: new Date(now.getTime() + 14 * 24 * HOUR) },
    })
      .sort({ dateTime: 1 })
      .lean(),
    Alert.find({ profileId: profile.id, slot: { $gte: new Date(now.getTime() - 48 * HOUR) } })
      .sort({ slot: -1 })
      .lean(),
    getActivity(profile.id, 8),
  ]);
  const doses = await getDoseItems(profile, [today], now, meds);
  const nameOf = new Map(members.map((member) => [member.userId, member.name]));
  const assigneeName = (id: string | null) => (id ? (nameOf.get(id) ?? null) : null);

  const pending: Responsibility[] = [];
  const completed: Responsibility[] = [];

  for (const dose of doses) {
    if (!dose.assigneeId) continue;
    const item: Responsibility = {
      key: `dose:${dose.key}`,
      kind: "dose",
      title: [dose.name, dose.dosage].filter(Boolean).join(" "),
      when: dose.scheduledFor,
      assigneeId: dose.assigneeId,
      assigneeName: assigneeName(dose.assigneeId),
      status: dose.status,
      doneByName: dose.loggedByName,
      doneAt: dose.loggedAt,
    };
    if (dose.status === "taken" || dose.status === "skipped" || dose.status === "missed") completed.push(item);
    else pending.push(item);
  }

  for (const appointment of appointmentDocs.map(toAppointmentDTO)) {
    const item: Responsibility = {
      key: `appointment:${appointment.id}`,
      kind: "appointment",
      title: `Visit to ${appointment.doctorName}`,
      when: appointment.dateTime,
      assigneeId: appointment.assigneeId,
      assigneeName: assigneeName(appointment.assigneeId),
      status: appointment.status,
      doneByName: appointment.statusChangedByName,
      doneAt: appointment.statusChangedAt,
    };
    if (appointment.status === "completed") completed.push(item);
    else if (appointment.status === "scheduled" && new Date(appointment.dateTime).getTime() >= now.getTime() - 2 * HOUR) {
      pending.push(item);
    }
  }

  const alerts = alertDocs.map(toAlertDTO);
  for (const alert of alerts) {
    if (alert.status === "open") continue;
    const at = alert.acknowledgedAt ?? alert.resolvedAt;
    if (!at || now.getTime() - new Date(at).getTime() > 24 * HOUR) continue;
    completed.push({
      key: `alert:${alert.id}`,
      kind: "alert",
      title: `Follow-up on the ${formatTime12h(alert.localTime)} alert`,
      when: alert.slot,
      assigneeId: null,
      assigneeName: alert.acknowledgedByName ?? alert.resolvedByName,
      status: alert.status,
      doneByName: alert.acknowledgedByName ?? alert.resolvedByName,
      doneAt: at,
    });
  }

  const assignments: Record<string, string[]> = {};
  const assign = (userId: string | null, what: string) => {
    if (userId) assignments[userId] = [...(assignments[userId] ?? []), what];
  };
  for (const med of meds.filter((m) => m.active)) assign(med.assigneeId, [med.name, med.dosage].filter(Boolean).join(" "));
  for (const item of pending.filter((p) => p.kind === "appointment")) assign(item.assigneeId, item.title);

  const byWhen = (a: Responsibility, b: Responsibility) => a.when.localeCompare(b.when);
  return {
    members,
    openAlerts: alerts.filter((alert) => alert.status !== "resolved"),
    pending: pending.sort(byWhen),
    completed: completed.sort((a, b) => (b.doneAt ?? b.when).localeCompare(a.doneAt ?? a.when)),
    unassignedMedicines: meds.filter((med) => med.active && !med.assigneeId),
    assignments,
    recentActivity,
    inviteExpired: new Date(profile.passcodeExpiresAt).getTime() <= now.getTime(),
  };
}

export interface TimelineFilters {
  /** Local dates (YYYY-MM-DD) in the profile's timezone, inclusive. */
  from: string;
  to: string;
  /** One event type, or null for all. */
  kind: ActivityKind | null;
  /** A member's userId, "saathi" for automatic events, or null for everyone. */
  member: string | null;
}

export interface TimelineResult {
  entries: ActivityDTO[];
  /** True when there were more entries than the page shows. */
  truncated: boolean;
  /** Escalations of doses due in the period, newest first. */
  alerts: AlertDTO[];
}

/** The care timeline: every recorded event in a period, optionally filtered by type and member. */
export async function getTimeline(profile: ProfileDTO, filters: TimelineFilters, limit = 300): Promise<TimelineResult> {
  await connectDB();
  const since = zonedToUtc(filters.from, "00:00", profile.timezone);
  const until = zonedToUtc(shiftDate(filters.to, 1), "00:00", profile.timezone);
  const query: Record<string, unknown> = { profileId: profile.id, createdAt: { $gte: since, $lt: until } };
  if (filters.kind) query.kind = filters.kind;
  if (filters.member === "saathi") query.actorId = null;
  else if (filters.member && mongoose.isValidObjectId(filters.member)) {
    // Older entries only know who acted; newer ones also list who was notified or assigned.
    query.$or = [{ involvedUserIds: filters.member }, { actorId: filters.member }];
  }

  const [docs, alerts] = await Promise.all([
    Activity.find(query)
      .sort({ createdAt: -1 })
      .limit(limit + 1)
      .lean(),
    getAlerts(profile.id, { since, until, limit: 60 }),
  ]);
  return { entries: docs.slice(0, limit).map(toActivityDTO), truncated: docs.length > limit, alerts };
}
