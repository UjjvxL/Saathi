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
  shiftDate,
  summarizeAdherence,
  todayInZone,
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
import type { AlertStatus } from "./constants";

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
      const overview = await getTodayOverview(profile, now);
      return {
        profile,
        membership: toMembershipDTO(membership),
        totalToday: overview.doses.length,
        takenToday: overview.summary.taken,
        pendingNow: overview.pendingCount,
        notTakenToday: overview.summary.missed + overview.summary.unconfirmed,
        nextAppointment: overview.nextAppointments[0] ?? null,
        lowStockCount: overview.lowStock.length,
      };
    }),
  );
  return entries
    .filter((entry): entry is DashboardEntry => entry !== null)
    .sort((a, b) => a.profile.name.localeCompare(b.profile.name));
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
