// The reminder and escalation engine. A scheduler calls /api/cron/reminders every few minutes, and for
// every care profile Saathi:
//  1. reminds the elder (and caretakers) when a dose is due,
//  2. sends a follow-up if it still isn't confirmed after the follow-up time (default 15 minutes),
//  3. at the escalation time (default 30 minutes) records the dose as "unconfirmed" (never as taken) and
//     alerts the member responsible for the medicine, or every caretaker and family member,
//  4. if nobody acknowledges that alert within 15 minutes, alerts the rest of the circle (once),
//  5. reminds everyone about doctor appointments (about 24 hours and 2 hours before),
//  6. warns when a medicine is running low,
//  7. emails the circle a summary of the previous week, on Monday morning.
// Each step is claimed before it is sent (ReminderLog keys and the Alert unique index), so overlapping
// runs never double-send and nothing loops. Each step is also written to the care timeline.
import "server-only";
import { DateTime } from "luxon";
import { logActivity } from "./activity";
import { ackAlertUrl, doseRef } from "./alerts";
import { signPurposeToken } from "./auth/jwt";
import { REMINDER_LEAD_MINUTES, ROLE_LABELS, WIDEN_ALERT_AFTER_MINUTES, type Role } from "./constants";
import { connectDB, isDuplicateKeyError } from "./db";
import { toAppointmentDTO, toMedicationDTO, toProfileDTO, toSchedule } from "./dto";
import { maskEmail, sendEmail, sendToAll } from "./email/mailer";
import * as templates from "./email/templates";
import { weeklySummaryEmail } from "./email/weekly-summary";
import { env } from "./env";
import { buildWeeklySummary } from "./insights";
import { Alert, Appointment, DoseLog, Medication, Membership, Profile, ReminderLog, User } from "./models";
import {
  doseKey,
  dosesForDate,
  formatInstant,
  formatTime12h,
  shiftDate,
  todayInZone,
  type ScheduledDose,
} from "./schedule";
import type { MedicationDTO, ProfileDTO } from "./types";

export const CONFIRM_DOSE_PURPOSE = "confirm-dose";
const SAATHI = "Saathi";

export interface ReminderSummary {
  profiles: number;
  /** "Medicine time" reminders sent. */
  upcoming: number;
  /** Follow-up reminders for doses still pending. */
  followUps: number;
  /** Dose slots escalated to the responsible members. */
  escalated: number;
  /** Alerts widened to the rest of the circle because nobody acknowledged them. */
  widened: number;
  appointments: number;
  lowStock: number;
  /** Weekly care summaries sent. */
  weekly: number;
  emails: number;
  errors: number;
}

/** Local hour on Monday after which last week's summary goes out. */
const WEEKLY_SUMMARY_HOUR = 7;

interface Person {
  /** null for the elder's own email address on the profile (they may not have an account). */
  userId: string | null;
  name: string;
  email: string;
  role: Role;
}

interface Circle {
  elder: Person[];
  caretakers: Person[];
  family: Person[];
  byUserId: Map<string, Person>;
}

/** Doses this late are no longer worth a follow-up, only recorded (avoids emailing about old doses). */
const NUDGE_WINDOW_MINUTES = 6 * 60;
const ESCALATION_WINDOW_MINUTES = 12 * 60;

let indexesReady: Promise<unknown> | null = null;

/**
 * The unique indexes are what make sending idempotent, so create them explicitly before the first run.
 * (createIndexes() talks to the database directly; it is a no-op when the indexes already exist.)
 */
function ensureReminderIndexes(): Promise<unknown> {
  indexesReady ??= Promise.all([ReminderLog.createIndexes(), DoseLog.createIndexes(), Alert.createIndexes()]).catch(
    (error) => {
      indexesReady = null; // try again on the next run
      console.error("[reminders] could not create indexes", error);
    },
  );
  return indexesReady;
}

export async function runReminders(now: Date = new Date(), options: { profileId?: string } = {}): Promise<ReminderSummary> {
  await connectDB();
  await ensureReminderIndexes();

  const summary: ReminderSummary = {
    profiles: 0,
    upcoming: 0,
    followUps: 0,
    escalated: 0,
    widened: 0,
    appointments: 0,
    lowStock: 0,
    weekly: 0,
    emails: 0,
    errors: 0,
  };
  const profiles = await Profile.find(options.profileId ? { _id: options.profileId } : {}).lean();
  for (const doc of profiles) {
    summary.profiles++;
    try {
      await processProfile(toProfileDTO(doc), now, summary);
    } catch (error) {
      summary.errors++;
      console.error(`[reminders] profile ${doc._id.toString()} failed`, error);
    }
  }
  return summary;
}

async function processProfile(profile: ProfileDTO, now: Date, summary: ReminderSummary): Promise<void> {
  const [circle, medDocs] = await Promise.all([
    loadCircle(profile),
    Medication.find({ profileId: profile.id, active: true }).lean(),
  ]);
  const meds = medDocs.map(toMedicationDTO);
  const today = todayInZone(profile.timezone, now);

  if (meds.length) await processDoses(profile, meds, circle, today, now, summary);
  await processOpenAlerts(profile, circle, now, summary);
  await processAppointments(profile, circle, now, summary);
  await processLowStock(profile, meds, circle, today, summary);
  await processWeeklySummary(profile, circle, now, summary);
}

/** Everyone in the circle who wants email, by role (plus the elder's own email on the profile). */
async function loadCircle(profile: ProfileDTO): Promise<Circle> {
  const memberships = await Membership.find({ profileId: profile.id, emailAlerts: true }).select("userId role").lean();
  const users = await User.find({ _id: { $in: memberships.map((m) => m.userId) } })
    .select("name email")
    .lean();
  const userById = new Map(users.map((user) => [user._id.toString(), user]));
  const circle: Circle = {
    elder: profile.elderEmail ? [{ userId: null, name: profile.name, email: profile.elderEmail, role: "elder" }] : [],
    caretakers: [],
    family: [],
    byUserId: new Map(),
  };
  for (const membership of memberships) {
    const user = userById.get(membership.userId.toString());
    if (!user) continue;
    const person: Person = { userId: user._id.toString(), name: user.name, email: user.email, role: membership.role as Role };
    circle.byUserId.set(person.userId as string, person);
    if (person.role === "elder") circle.elder.push(person);
    else if (person.role === "caretaker") circle.caretakers.push(person);
    else circle.family.push(person);
  }
  return circle;
}

/** One entry per email address, keeping the first (so a named member wins over a bare address). */
function unique(people: Person[]): Person[] {
  const seen = new Set<string>();
  return people.filter((person) => {
    const key = person.email.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function namesOf(people: Person[]): string {
  const names = [...new Set(people.map((person) => person.name))];
  if (names.length <= 2) return names.join(" and ");
  return `${names.slice(0, 2).join(", ")} and ${names.length - 2} more`;
}

function userIds(people: Person[]): string[] {
  return people.map((person) => person.userId).filter((id): id is string => Boolean(id));
}

function medicineLabel(med: MedicationDTO | undefined): string {
  if (!med) return "Medicine";
  const parts = [med.name, med.dosage].filter(Boolean).join(" ");
  return med.instructions ? `${parts} (${med.instructions})` : parts;
}

function shortLabel(med: MedicationDTO): string {
  return [med.name, med.dosage].filter(Boolean).join(" ");
}

async function claim(key: string, profileId: string, kind: string): Promise<boolean> {
  try {
    await ReminderLog.create({ key, profileId, kind });
    return true;
  } catch (error) {
    if (isDuplicateKeyError(error)) return false;
    throw error;
  }
}

/** Claims a reminder, sends it, and releases the claim if every send failed (so the next run retries). */
async function sendOnce(
  key: string,
  profileId: string,
  kind: string,
  to: string[],
  content: templates.EmailContent,
): Promise<number | null> {
  if (!to.length || !(await claim(key, profileId, kind))) return null;
  const result = await sendToAll(to, content);
  if (result.sent === 0 && result.failed > 0) {
    await ReminderLog.deleteOne({ key });
    return null;
  }
  await ReminderLog.updateOne({ key }, { $set: { recipients: to } });
  return result.sent;
}

/** Sends each person their own copy (with a personal "I'm on it" link). Returns how many were sent. */
async function sendPersonal(people: Person[], build: (person: Person) => Promise<templates.EmailContent>): Promise<number> {
  let sent = 0;
  for (const person of people) {
    try {
      await sendEmail(person.email, await build(person));
      sent++;
    } catch (error) {
      console.error(`[reminders] alert email to ${maskEmail(person.email)} failed`, error);
    }
  }
  return sent;
}

export async function confirmDoseUrl(profileId: string, slotIso: string): Promise<string> {
  const token = await signPurposeToken(CONFIRM_DOSE_PURPOSE, { profileId, slot: slotIso }, "12h");
  return `${env.appUrl()}/confirm?token=${encodeURIComponent(token)}`;
}

/** The members responsible for any of these medicines who want email (never the elder themself). */
function responsibleFor(meds: MedicationDTO[], circle: Circle): Person[] {
  const people = meds
    .map((med) => (med.assigneeId ? circle.byUserId.get(med.assigneeId) : undefined))
    .filter((person): person is Person => Boolean(person) && person?.role !== "elder");
  return unique(people);
}

async function processDoses(
  profile: ProfileDTO,
  meds: MedicationDTO[],
  circle: Circle,
  today: string,
  now: Date,
  summary: ReminderSummary,
): Promise<void> {
  const yesterday = shiftDate(today, -1);
  const schedules = meds.map(toSchedule);
  const doses = [
    ...dosesForDate(schedules, yesterday, profile.timezone),
    ...dosesForDate(schedules, today, profile.timezone),
  ];
  if (!doses.length) return;

  const logs = await DoseLog.find({ profileId: profile.id, localDate: { $in: [yesterday, today] } })
    .select("medicationId scheduledFor")
    .lean();
  const logged = new Set(logs.map((log) => doseKey(log.medicationId.toString(), log.scheduledFor)));
  const medById = new Map(meds.map((med) => [med.id, med]));

  // Group doses that nobody has recorded yet into time slots (e.g. all 8:00 AM medicines together).
  const slots = new Map<string, ScheduledDose[]>();
  for (const dose of doses) {
    if (logged.has(doseKey(dose.medicationId, dose.scheduledFor))) continue;
    const slot = dose.scheduledFor.toISOString();
    slots.set(slot, [...(slots.get(slot) ?? []), dose]);
  }

  const appUrl = `${env.appUrl()}/p/${profile.id}`;
  for (const [slot, slotDoses] of slots) {
    const slotDate = new Date(slot);
    const minutesLate = (now.getTime() - slotDate.getTime()) / 60_000;
    const timeLabel = formatTime12h(slotDoses[0].localTime);
    const slotMeds = slotDoses.map((dose) => medById.get(dose.medicationId)).filter((med): med is MedicationDTO => Boolean(med));
    const medicines = slotMeds.map(medicineLabel);
    const shortList = slotMeds.map(shortLabel).join(", ");
    const responsible = responsibleFor(slotMeds, circle);

    if (minutesLate >= profile.escalateAfterMinutes) {
      // The alert is created (and claimed) first: if anything fails before the doses are recorded as
      // unconfirmed, the next run tries again, and the unique index stops a second alert.
      if (minutesLate <= profile.escalateAfterMinutes + ESCALATION_WINDOW_MINUTES) {
        await escalate({ profile, circle, slotDate, slotDoses, slotMeds, medicines, shortList, responsible, minutesLate, now, appUrl, summary });
      }
      await recordUnconfirmed(profile, slotDoses);
    } else if (minutesLate >= profile.followUpAfterMinutes) {
      if (minutesLate > profile.followUpAfterMinutes + NUDGE_WINDOW_MINUTES) continue;
      const to = unique([...circle.elder, ...circle.caretakers, ...responsible]);
      const sent = await sendOnce(
        `dose-followup:${profile.id}:${slot}`,
        profile.id,
        "dose-followup",
        to.map((person) => person.email),
        templates.followUpEmail({
          elderName: profile.name,
          timeLabel,
          medicines,
          minutesLate,
          confirmUrl: await confirmDoseUrl(profile.id, slot),
          appUrl,
        }),
      );
      if (sent !== null) {
        summary.followUps++;
        summary.emails += sent;
        await logActivity({
          profileId: profile.id,
          actorName: SAATHI,
          kind: "reminder",
          message: `The ${timeLabel} dose (${shortList}) was still pending after ${profile.followUpAfterMinutes} minutes. Follow-up reminder sent to ${namesOf(to)}.`,
          status: "pending",
          refId: doseRef(slotDate),
          involvedUserIds: userIds(to),
        });
      }
    } else if (minutesLate >= -REMINDER_LEAD_MINUTES) {
      const to = unique([...circle.elder, ...circle.caretakers, ...responsible]);
      const sent = await sendOnce(
        `dose-upcoming:${profile.id}:${slot}`,
        profile.id,
        "dose-upcoming",
        to.map((person) => person.email),
        templates.doseReminderEmail({
          elderName: profile.name,
          timeLabel,
          medicines,
          confirmUrl: await confirmDoseUrl(profile.id, slot),
          appUrl,
        }),
      );
      if (sent !== null) {
        summary.upcoming++;
        summary.emails += sent;
        await logActivity({
          profileId: profile.id,
          actorName: SAATHI,
          kind: "reminder",
          message: `Reminder sent for the ${timeLabel} dose (${shortList}) to ${namesOf(to)}.`,
          status: "pending",
          refId: doseRef(slotDate),
          involvedUserIds: userIds(to),
        });
      }
    }
  }
}

/** Records the slot's doses as unconfirmed, never overwriting something a person recorded meanwhile. */
async function recordUnconfirmed(profile: ProfileDTO, slotDoses: ScheduledDose[]): Promise<void> {
  await DoseLog.bulkWrite(
    slotDoses.map((dose) => ({
      updateOne: {
        filter: { medicationId: dose.medicationId, scheduledFor: dose.scheduledFor },
        update: {
          $setOnInsert: {
            profileId: profile.id,
            localDate: dose.localDate,
            localTime: dose.localTime,
            status: "unconfirmed",
          },
        },
        upsert: true,
      },
    })),
  );
}

async function escalate(input: {
  profile: ProfileDTO;
  circle: Circle;
  slotDate: Date;
  slotDoses: ScheduledDose[];
  slotMeds: MedicationDTO[];
  medicines: string[];
  shortList: string;
  responsible: Person[];
  minutesLate: number;
  now: Date;
  appUrl: string;
  summary: ReminderSummary;
}): Promise<void> {
  const { profile, circle, slotDate, slotDoses, slotMeds, medicines, shortList, responsible, minutesLate, now, appUrl, summary } = input;
  const slot = slotDate.toISOString();
  const timeLabel = formatTime12h(slotDoses[0].localTime);
  // The people responsible for these medicines come first; without one, every caretaker and family member.
  const notify = responsible.length ? responsible : unique([...circle.caretakers, ...circle.family]);

  const sentLogs = await ReminderLog.find({
    key: { $in: [`dose-upcoming:${profile.id}:${slot}`, `dose-followup:${profile.id}:${slot}`] },
  })
    .select("key createdAt")
    .lean();
  const sentAt = (kind: string) => sentLogs.find((log) => log.key.startsWith(kind))?.createdAt ?? null;

  let alertId: string;
  try {
    const alert = await Alert.create({
      profileId: profile.id,
      slot: slotDate,
      localDate: slotDoses[0].localDate,
      localTime: slotDoses[0].localTime,
      medicationIds: slotMeds.map((med) => med.id),
      medicines,
      status: "open",
      reminderSentAt: sentAt("dose-upcoming"),
      followUpSentAt: sentAt("dose-followup"),
      escalatedAt: now,
      notifiedUserIds: userIds(notify),
      notifiedNames: notify.map((person) => person.name),
    });
    alertId = alert._id.toString();
  } catch (error) {
    if (isDuplicateKeyError(error)) return; // already escalated by an earlier (or parallel) run
    throw error;
  }

  summary.escalated++;
  summary.emails += await sendPersonal(notify, async (person) =>
    templates.escalationEmail({
      recipientName: person.name,
      elderName: profile.name,
      timeLabel,
      medicines,
      minutesLate,
      ackUrl: person.userId ? await ackAlertUrl(alertId, person.userId) : appUrl,
      appUrl,
    }),
  );

  const who = responsible.length
    ? `${namesOf(notify)} (responsible) ${notify.length === 1 ? "was" : "were"} alerted`
    : `${namesOf(notify)} ${notify.length === 1 ? "was" : "were"} alerted`;
  await logActivity({
    profileId: profile.id,
    actorName: SAATHI,
    kind: "alert",
    message: notify.length
      ? `The ${timeLabel} dose (${shortList}) was still unconfirmed after ${profile.escalateAfterMinutes} minutes. ${who} by email.`
      : `The ${timeLabel} dose (${shortList}) was still unconfirmed after ${profile.escalateAfterMinutes} minutes. Nobody has email alerts on, so the alert is shown in the app.`,
    status: "unconfirmed",
    refId: doseRef(slotDate),
    involvedUserIds: userIds(notify),
  });
}

/** If nobody acknowledged an alert in time, tell everyone else in the circle, exactly once. */
async function processOpenAlerts(profile: ProfileDTO, circle: Circle, now: Date, summary: ReminderSummary): Promise<void> {
  const dueBefore = new Date(now.getTime() - WIDEN_ALERT_AFTER_MINUTES * 60_000);
  const notOlderThan = new Date(now.getTime() - ESCALATION_WINDOW_MINUTES * 60_000);
  const candidates = await Alert.find({
    profileId: profile.id,
    status: "open",
    widenedAt: null,
    escalatedAt: { $lte: dueBefore, $gte: notOlderThan },
  }).lean();

  for (const candidate of candidates) {
    // Claim it first, so parallel runs can't both widen the same alert.
    const alert = await Alert.findOneAndUpdate(
      { _id: candidate._id, status: "open", widenedAt: null },
      { $set: { widenedAt: now } },
      { returnDocument: "after" },
    ).lean();
    if (!alert) continue;

    const alreadyAlerted = new Set(alert.notifiedUserIds.map((id) => id.toString()));
    const others = unique([...circle.caretakers, ...circle.family]).filter(
      (person) => person.userId && !alreadyAlerted.has(person.userId),
    );
    const timeLabel = formatTime12h(alert.localTime);
    if (!others.length) {
      await logActivity({
        profileId: profile.id,
        actorName: SAATHI,
        kind: "alert",
        message: `Nobody acknowledged the ${timeLabel} alert within ${WIDEN_ALERT_AFTER_MINUTES} minutes, and there is nobody else with email alerts to tell.`,
        status: "open",
        refId: doseRef(alert.slot),
      });
      continue;
    }

    await Alert.updateOne({ _id: alert._id }, { $set: { widenedNames: others.map((person) => person.name) } });
    const minutesLate = (now.getTime() - alert.slot.getTime()) / 60_000;
    const appUrl = `${env.appUrl()}/p/${profile.id}`;
    summary.widened++;
    summary.emails += await sendPersonal(others, async (person) =>
      templates.escalationEmail({
        recipientName: person.name,
        elderName: profile.name,
        timeLabel,
        medicines: alert.medicines,
        minutesLate,
        ackUrl: await ackAlertUrl(alert._id.toString(), person.userId as string),
        appUrl,
        alreadyAlerted: alert.notifiedNames,
      }),
    );
    await logActivity({
      profileId: profile.id,
      actorName: SAATHI,
      kind: "alert",
      message: `Nobody acknowledged the ${timeLabel} alert within ${WIDEN_ALERT_AFTER_MINUTES} minutes, so ${namesOf(others)} ${others.length === 1 ? "was" : "were"} alerted too.`,
      status: "open",
      refId: doseRef(alert.slot),
      involvedUserIds: userIds(others),
    });
  }
}

async function processAppointments(profile: ProfileDTO, circle: Circle, now: Date, summary: ReminderSummary): Promise<void> {
  const dayAhead = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const docs = await Appointment.find({
    profileId: profile.id,
    status: "scheduled",
    dateTime: { $gt: now, $lte: dayAhead },
  }).lean();
  const to = unique([...circle.elder, ...circle.caretakers, ...circle.family]).map((person) => person.email);

  for (const appointment of docs.map(toAppointmentDTO)) {
    const hoursUntil = (new Date(appointment.dateTime).getTime() - now.getTime()) / 3_600_000;
    const soon = hoursUntil <= 2;
    const kind = soon ? "appointment-2h" : "appointment-24h";
    const sent = await sendOnce(
      `${kind}:${appointment.id}`,
      profile.id,
      kind,
      to,
      templates.appointmentReminderEmail({
        elderName: profile.name,
        doctorName: appointment.doctorName,
        specialty: appointment.specialty,
        whenLabel: formatInstant(new Date(appointment.dateTime), profile.timezone),
        location: appointment.location,
        notes: appointment.notes,
        soon,
        appUrl: `${env.appUrl()}/p/${profile.id}/appointments`,
      }),
    );
    if (sent !== null) {
      summary.appointments++;
      summary.emails += sent;
      await logActivity({
        profileId: profile.id,
        actorName: SAATHI,
        kind: "reminder",
        message: `Appointment reminder sent (${soon ? "2 hours" : "1 day"} before the visit with ${appointment.doctorName}).`,
        status: "scheduled",
        refId: `appointment:${appointment.id}`,
      });
    }
  }
}

async function processLowStock(
  profile: ProfileDTO,
  meds: MedicationDTO[],
  circle: Circle,
  today: string,
  summary: ReminderSummary,
): Promise<void> {
  const to = unique([...circle.caretakers, ...circle.family, ...circle.elder]).map((person) => person.email);
  for (const med of meds) {
    if (med.stock === null || med.refillThreshold === null || med.stock > med.refillThreshold) continue;
    const sent = await sendOnce(
      `low-stock:${med.id}:${today}`,
      profile.id,
      "low-stock",
      to,
      templates.lowStockEmail({
        elderName: profile.name,
        medicine: shortLabel(med),
        stock: med.stock,
        appUrl: `${env.appUrl()}/p/${profile.id}/medications`,
      }),
    );
    if (sent !== null) {
      summary.lowStock++;
      summary.emails += sent;
    }
  }
}

/** Once a week (Monday morning, profile time), a summary of the previous week for the whole circle. */
async function processWeeklySummary(profile: ProfileDTO, circle: Circle, now: Date, summary: ReminderSummary): Promise<void> {
  const local = DateTime.fromJSDate(now).setZone(profile.timezone);
  if (local.weekday !== 1 || local.hour < WEEKLY_SUMMARY_HOUR) return;
  // Same week id as buildWeeklySummary(): the Monday of the week that just ended.
  const key = `weekly-summary:${profile.id}:${local.startOf("week").minus({ weeks: 1 }).toFormat("kkkk-'W'WW")}`;
  if (await ReminderLog.exists({ key })) return; // checked first, so the report isn't rebuilt on every run

  const to = unique([...circle.family, ...circle.caretakers, ...circle.elder]);
  const weekly = to.length ? await buildWeeklySummary(profile, now) : null;
  if (!weekly?.hasData) {
    await claim(key, profile.id, "weekly-summary"); // nothing to send this week
    return;
  }
  const sent = await sendOnce(
    key,
    profile.id,
    "weekly-summary",
    to.map((person) => person.email),
    weeklySummaryEmail(weekly, `${env.appUrl()}/p/${profile.id}/insights`),
  );
  if (sent !== null) {
    summary.weekly++;
    summary.emails += sent;
    await logActivity({
      profileId: profile.id,
      actorName: SAATHI,
      kind: "reminder",
      message: `Weekly care summary for ${weekly.periodLabel} sent to ${namesOf(to)}.`,
      involvedUserIds: userIds(to),
    });
  }
}

/** Notifies the circle's admins and the elder that someone joined (the elder stays in control). */
export async function notifyMemberJoined(profile: ProfileDTO, memberName: string, role: keyof typeof ROLE_LABELS, joinedUserId: string) {
  const admins = await Membership.find({ profileId: profile.id, isAdmin: true, emailAlerts: true }).select("userId").lean();
  const users = await User.find({ _id: { $in: admins.map((a) => a.userId).filter((id) => id.toString() !== joinedUserId) } })
    .select("email")
    .lean();
  const to = [...users.map((user) => user.email), ...(profile.elderEmail ? [profile.elderEmail] : [])];
  if (!to.length) return;
  await sendToAll(
    to,
    templates.memberJoinedEmail({
      elderName: profile.name,
      memberName,
      roleLabel: ROLE_LABELS[role].toLowerCase(),
      appUrl: `${env.appUrl()}/p/${profile.id}/circle`,
    }),
  );
}
