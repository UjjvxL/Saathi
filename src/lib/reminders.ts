// The reminder engine. Runs every few minutes (Cloud Scheduler -> /api/cron/reminders) and:
//  1. emails "medicine time" reminders just before each dose,
//  2. nudges the elder and caretakers when a dose isn't marked taken after a grace period,
//  3. escalates to the whole family if it's still not taken, and records it as missed,
//  4. reminds everyone about doctor appointments (about 24h and 2h before),
//  5. warns when a medicine is running low.
// Every email is claimed in ReminderLog first (unique key), so overlapping runs never double-send.
import "server-only";
import { logActivity } from "./activity";
import { signPurposeToken } from "./auth/jwt";
import { REMINDER_LEAD_MINUTES, ROLE_LABELS } from "./constants";
import { connectDB, isDuplicateKeyError } from "./db";
import { toAppointmentDTO, toMedicationDTO, toProfileDTO, toSchedule } from "./dto";
import { sendToAll } from "./email/mailer";
import * as templates from "./email/templates";
import { env } from "./env";
import { Appointment, DoseLog, Medication, Membership, Profile, ReminderLog, User } from "./models";
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

export interface ReminderSummary {
  profiles: number;
  upcoming: number;
  missed: number;
  escalated: number;
  appointments: number;
  lowStock: number;
  emails: number;
  errors: number;
}

interface Recipients {
  elder: string[];
  caretakers: string[];
  family: string[];
}

/** Doses this late are no longer worth a nudge, only recorded (avoids emailing about old doses). */
const NUDGE_WINDOW_MINUTES = 6 * 60;
const ESCALATION_WINDOW_MINUTES = 12 * 60;

let indexesReady: Promise<unknown> | null = null;

/**
 * The unique indexes are what make sending idempotent, so create them explicitly before the first run.
 * (createIndexes() talks to the database directly; it is a no-op when the indexes already exist.)
 */
function ensureReminderIndexes(): Promise<unknown> {
  indexesReady ??= Promise.all([ReminderLog.createIndexes(), DoseLog.createIndexes()]).catch((error) => {
    indexesReady = null; // try again on the next run
    console.error("[reminders] could not create indexes", error);
  });
  return indexesReady;
}

export async function runReminders(now: Date = new Date(), options: { profileId?: string } = {}): Promise<ReminderSummary> {
  await connectDB();
  await ensureReminderIndexes();

  const summary: ReminderSummary = {
    profiles: 0,
    upcoming: 0,
    missed: 0,
    escalated: 0,
    appointments: 0,
    lowStock: 0,
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
  const [recipients, medDocs] = await Promise.all([
    loadRecipients(profile),
    Medication.find({ profileId: profile.id, active: true }).lean(),
  ]);
  const meds = medDocs.map(toMedicationDTO);
  const today = todayInZone(profile.timezone, now);

  if (meds.length) await processDoses(profile, meds, recipients, today, now, summary);
  await processAppointments(profile, recipients, now, summary);
  await processLowStock(profile, meds, recipients, today, summary);
}

async function loadRecipients(profile: ProfileDTO): Promise<Recipients> {
  const memberships = await Membership.find({ profileId: profile.id, emailAlerts: true }).select("userId role").lean();
  const users = await User.find({ _id: { $in: memberships.map((m) => m.userId) } }).select("email").lean();
  const emailById = new Map(users.map((user) => [user._id.toString(), user.email]));
  const recipients: Recipients = { elder: profile.elderEmail ? [profile.elderEmail] : [], caretakers: [], family: [] };
  for (const membership of memberships) {
    const email = emailById.get(membership.userId.toString());
    if (!email) continue;
    if (membership.role === "elder") recipients.elder.push(email);
    else if (membership.role === "caretaker") recipients.caretakers.push(email);
    else recipients.family.push(email);
  }
  return recipients;
}

function medicineLabel(med: MedicationDTO | undefined): string {
  if (!med) return "Medicine";
  const parts = [med.name, med.dosage].filter(Boolean).join(" ");
  return med.instructions ? `${parts} (${med.instructions})` : parts;
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

export async function confirmDoseUrl(profileId: string, slotIso: string): Promise<string> {
  const token = await signPurposeToken(CONFIRM_DOSE_PURPOSE, { profileId, slot: slotIso }, "12h");
  return `${env.appUrl()}/confirm?token=${encodeURIComponent(token)}`;
}

async function processDoses(
  profile: ProfileDTO,
  meds: MedicationDTO[],
  recipients: Recipients,
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

  // Group doses that nobody has logged yet into time slots (e.g. all 8:00 AM medicines together).
  const slots = new Map<string, ScheduledDose[]>();
  for (const dose of doses) {
    if (logged.has(doseKey(dose.medicationId, dose.scheduledFor))) continue;
    const slot = dose.scheduledFor.toISOString();
    slots.set(slot, [...(slots.get(slot) ?? []), dose]);
  }

  const appUrl = `${env.appUrl()}/p/${profile.id}`;
  for (const [slot, slotDoses] of slots) {
    const minutesLate = (now.getTime() - new Date(slot).getTime()) / 60_000;
    const timeLabel = formatTime12h(slotDoses[0].localTime);
    const medicines = slotDoses.map((dose) => medicineLabel(medById.get(dose.medicationId)));

    if (minutesLate >= profile.escalateAfterMinutes) {
      // Record as missed (never overwriting a log someone just added), then alert the family once.
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
      if (minutesLate > profile.escalateAfterMinutes + ESCALATION_WINDOW_MINUTES) continue;
      const key = `dose-escalated:${profile.id}:${slot}`;
      const isNew = await claim(key, profile.id, "dose-escalated");
      if (!isNew) continue;
      summary.escalated++;
      const to = [...recipients.caretakers, ...recipients.family];
      if (to.length) {
        const result = await sendToAll(
          to,
          templates.escalationEmail({ elderName: profile.name, timeLabel, medicines, minutesLate, appUrl }),
        );
        summary.emails += result.sent;
        await ReminderLog.updateOne({ key }, { $set: { recipients: to } });
      }
      await logActivity({
        profileId: profile.id,
        actorName: "Saathi",
        kind: "alert",
        message: `Missed ${timeLabel} dose: ${medicines.join(", ")}.${to.length ? " Family alerted by email." : ""}`,
      });
    } else if (minutesLate >= profile.followUpAfterMinutes) {
      if (minutesLate > profile.followUpAfterMinutes + NUDGE_WINDOW_MINUTES) continue;
      const sent = await sendOnce(
        `dose-missed:${profile.id}:${slot}`,
        profile.id,
        "dose-missed",
        [...recipients.elder, ...recipients.caretakers],
        templates.missedDoseEmail({
          elderName: profile.name,
          timeLabel,
          medicines,
          confirmUrl: await confirmDoseUrl(profile.id, slot),
          appUrl,
        }),
      );
      if (sent !== null) {
        summary.missed++;
        summary.emails += sent;
      }
    } else if (minutesLate >= -REMINDER_LEAD_MINUTES && minutesLate < profile.followUpAfterMinutes) {
      const sent = await sendOnce(
        `dose-upcoming:${profile.id}:${slot}`,
        profile.id,
        "dose-upcoming",
        [...recipients.elder, ...recipients.caretakers],
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
      }
    }
  }
}

async function processAppointments(
  profile: ProfileDTO,
  recipients: Recipients,
  now: Date,
  summary: ReminderSummary,
): Promise<void> {
  const dayAhead = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const docs = await Appointment.find({
    profileId: profile.id,
    status: "scheduled",
    dateTime: { $gt: now, $lte: dayAhead },
  }).lean();
  const to = [...recipients.elder, ...recipients.caretakers, ...recipients.family];

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
    }
  }
}

async function processLowStock(
  profile: ProfileDTO,
  meds: MedicationDTO[],
  recipients: Recipients,
  today: string,
  summary: ReminderSummary,
): Promise<void> {
  const to = [...recipients.caretakers, ...recipients.family, ...recipients.elder];
  for (const med of meds) {
    if (med.stock === null || med.refillThreshold === null || med.stock > med.refillThreshold) continue;
    const sent = await sendOnce(
      `low-stock:${med.id}:${today}`,
      profile.id,
      "low-stock",
      to,
      templates.lowStockEmail({
        elderName: profile.name,
        medicine: [med.name, med.dosage].filter(Boolean).join(" "),
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
