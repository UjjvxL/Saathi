// Recording what happened to a dose (shared by the app and the "I took it" email link).
import "server-only";
import mongoose from "mongoose";
import { logActivity } from "./activity";
import { connectDB } from "./db";
import { toMedicationDTO, toSchedule } from "./dto";
import { DoseLog, Medication } from "./models";
import { formatTime12h, isScheduledDose, utcToZoned } from "./schedule";
import type { ProfileDTO } from "./types";

interface Actor {
  id: string | null;
  name: string;
}

type Outcome = { ok: true } | { ok: false; message: string };

const NOT_FOUND: Outcome = { ok: false, message: "That dose couldn’t be found. Please refresh the page." };
const MAX_EARLY_HOURS = 2;
const MAX_AGE_HOURS = 24 * 7;

export async function recordDose(input: {
  profile: ProfileDTO;
  medicationId: string;
  scheduledFor: Date;
  status: "taken" | "skipped";
  actor: Actor;
}): Promise<Outcome> {
  const { profile, medicationId, scheduledFor, status, actor } = input;
  if (!mongoose.isValidObjectId(medicationId) || Number.isNaN(scheduledFor.getTime())) return NOT_FOUND;
  await connectDB();

  const medDoc = await Medication.findOne({ _id: medicationId, profileId: profile.id }).lean();
  if (!medDoc) return NOT_FOUND;
  const med = toMedicationDTO(medDoc);
  const existing = await DoseLog.findOne({ medicationId, scheduledFor }).lean();
  const now = new Date();

  if (!existing) {
    // Only real, scheduled doses can be logged; this rejects forged or tampered requests.
    if (!med.active || !isScheduledDose(toSchedule(med), scheduledFor, profile.timezone)) return NOT_FOUND;
    const hoursAhead = (scheduledFor.getTime() - now.getTime()) / 3_600_000;
    if (hoursAhead > MAX_EARLY_HOURS) {
      return { ok: false, message: `This dose isn’t due yet. It can be marked up to ${MAX_EARLY_HOURS} hours early.` };
    }
    if (hoursAhead < -MAX_AGE_HOURS) return { ok: false, message: "This dose is too old to change." };
  }
  if (existing?.status === status) return { ok: true };

  // Keep the pill count in sync: taking a dose uses stock, changing it back returns it.
  let stockDeducted = existing?.stockDeducted ?? 0;
  if (status === "taken" && med.stock !== null && med.unitsPerDose > 0) {
    const deduct = Math.min(med.unitsPerDose, med.stock);
    if (deduct > 0) {
      const result = await Medication.updateOne({ _id: med.id, stock: { $gte: deduct } }, { $inc: { stock: -deduct } });
      stockDeducted = result.modifiedCount ? deduct : 0;
    }
  } else if (existing?.status === "taken" && stockDeducted > 0) {
    await Medication.updateOne({ _id: med.id, stock: { $ne: null } }, { $inc: { stock: stockDeducted } });
    stockDeducted = 0;
  }

  const { localDate, localTime } = utcToZoned(scheduledFor, profile.timezone);
  await DoseLog.updateOne(
    { medicationId, scheduledFor },
    {
      $set: {
        profileId: profile.id,
        localDate,
        localTime,
        status,
        takenAt: status === "taken" ? now : null,
        loggedBy: actor.id,
        loggedByName: actor.name,
        stockDeducted,
      },
    },
    { upsert: true },
  );

  const label = [med.name, med.dosage].filter(Boolean).join(" ");
  await logActivity({
    profileId: profile.id,
    actorId: actor.id,
    actorName: actor.name,
    kind: "dose",
    message: `${actor.name} marked ${label} (${formatTime12h(localTime)}) as ${status}`,
  });
  return { ok: true };
}

export async function undoDose(input: {
  profile: ProfileDTO;
  medicationId: string;
  scheduledFor: Date;
  actor: Actor;
}): Promise<Outcome> {
  const { profile, medicationId, scheduledFor, actor } = input;
  if (!mongoose.isValidObjectId(medicationId) || Number.isNaN(scheduledFor.getTime())) return NOT_FOUND;
  await connectDB();

  const log = await DoseLog.findOne({ profileId: profile.id, medicationId, scheduledFor }).lean();
  if (!log) return { ok: true };
  if (log.status === "taken" && (log.stockDeducted ?? 0) > 0) {
    await Medication.updateOne({ _id: medicationId, stock: { $ne: null } }, { $inc: { stock: log.stockDeducted } });
  }
  await DoseLog.deleteOne({ _id: log._id });

  const med = await Medication.findById(medicationId).select("name").lean();
  await logActivity({
    profileId: profile.id,
    actorId: actor.id,
    actorName: actor.name,
    kind: "dose",
    message: `${actor.name} undid “${log.status}” for ${med?.name ?? "a medicine"} (${formatTime12h(log.localTime)})`,
  });
  return { ok: true };
}
