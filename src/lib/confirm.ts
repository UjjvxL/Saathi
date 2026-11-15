import "server-only";
import mongoose from "mongoose";
import { verifyPurposeToken } from "./auth/jwt";
import { connectDB } from "./db";
import { getDoseItems } from "./data";
import { toProfileDTO } from "./dto";
import { Profile } from "./models";
import { CONFIRM_DOSE_PURPOSE } from "./reminders";
import { formatLocalDate, formatTime12h, utcToZoned } from "./schedule";
import type { DoseItem } from "./types";

export interface ConfirmSlot {
  elderName: string;
  timeLabel: string;
  dateLabel: string;
  doses: DoseItem[];
}

/** Loads the time slot behind a reminder-email link, or null if the link is invalid or expired. */
export async function loadConfirmSlot(token: string): Promise<ConfirmSlot | null> {
  const claims = await verifyPurposeToken(token, CONFIRM_DOSE_PURPOSE);
  if (!claims || typeof claims.profileId !== "string" || typeof claims.slot !== "string") return null;
  if (!mongoose.isValidObjectId(claims.profileId)) return null;
  const scheduledFor = new Date(claims.slot);
  if (Number.isNaN(scheduledFor.getTime())) return null;

  await connectDB();
  const profileDoc = await Profile.findById(claims.profileId).lean();
  if (!profileDoc) return null;
  const profile = toProfileDTO(profileDoc);
  const { localDate, localTime } = utcToZoned(scheduledFor, profile.timezone);
  const slotIso = scheduledFor.toISOString();
  const doses = (await getDoseItems(profile, [localDate])).filter((dose) => dose.scheduledFor === slotIso);

  return {
    elderName: profile.name,
    timeLabel: formatTime12h(localTime),
    dateLabel: formatLocalDate(localDate),
    doses,
  };
}
