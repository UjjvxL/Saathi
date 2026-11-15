// The life of an escalated dose (an "alert"): Saathi opens it when a dose slot is still unconfirmed at
// the escalation time; a member acknowledges it ("I'm on it"); it resolves by itself once every dose in
// the slot has been recorded by a person. Every step is written to the care timeline.
import "server-only";
import mongoose from "mongoose";
import { logActivity } from "./activity";
import { signPurposeToken, verifyPurposeToken } from "./auth/jwt";
import { connectDB } from "./db";
import { toAlertDTO, toProfileDTO } from "./dto";
import { env } from "./env";
import { Alert, DoseLog, Membership, Profile, User } from "./models";
import { formatTime12h } from "./schedule";
import type { AlertDTO, ProfileDTO } from "./types";

export const ACK_ALERT_PURPOSE = "ack-alert";
const ACK_LINK_TTL = "24h";

interface Actor {
  id: string | null;
  name: string;
}

/** Groups every timeline entry about one dose time slot (reminder, follow-up, alert, acknowledgement…). */
export function doseRef(slot: Date | string): string {
  return `dose:${new Date(slot).toISOString()}`;
}

/** A personal "I'm on it" link for one member, valid for 24 hours. */
export async function ackAlertUrl(alertId: string, userId: string): Promise<string> {
  const token = await signPurposeToken(ACK_ALERT_PURPOSE, { alertId, userId }, ACK_LINK_TTL);
  return `${env.appUrl()}/alerts/ack?token=${encodeURIComponent(token)}`;
}

export type AckOutcome = { ok: true; alert: AlertDTO; already: boolean } | { ok: false; message: string };

const NOT_FOUND = { ok: false, message: "That alert couldn’t be found. It may have been removed." } as const;

/**
 * Records that a member is following up on an alert. Only the first acknowledgement counts (atomic
 * update), so two people tapping "I'm on it" at once never overwrite each other.
 */
export async function acknowledgeAlert(input: {
  profile: ProfileDTO;
  alertId: string;
  actor: { id: string; name: string };
  now?: Date;
}): Promise<AckOutcome> {
  const { profile, alertId, actor } = input;
  if (!mongoose.isValidObjectId(alertId)) return NOT_FOUND;
  await connectDB();
  const now = input.now ?? new Date();

  const updated = await Alert.findOneAndUpdate(
    { _id: alertId, profileId: profile.id, status: "open" },
    { $set: { status: "acknowledged", acknowledgedAt: now, acknowledgedById: actor.id, acknowledgedByName: actor.name } },
    { returnDocument: "after" },
  ).lean();
  if (!updated) {
    const existing = await Alert.findOne({ _id: alertId, profileId: profile.id }).lean();
    return existing ? { ok: true, alert: toAlertDTO(existing), already: true } : NOT_FOUND;
  }

  const minutes = Math.max(0, Math.round((now.getTime() - updated.escalatedAt.getTime()) / 60_000));
  await logActivity({
    profileId: profile.id,
    actorId: actor.id,
    actorName: actor.name,
    kind: "acknowledgement",
    message: `${actor.name} acknowledged the ${formatTime12h(updated.localTime)} alert and is following up (${minutes} min after the alert)`,
    status: "acknowledged",
    refId: doseRef(updated.slot),
  });
  return { ok: true, alert: toAlertDTO(updated), already: false };
}

/** Called after a dose is recorded: closes the slot's alert once every medicine in it has an outcome. */
export async function syncAlertForSlot(profile: ProfileDTO, slot: Date, actor: Actor): Promise<void> {
  const alert = await Alert.findOne({ profileId: profile.id, slot, status: { $ne: "resolved" } }).lean();
  if (!alert) return;
  const logs = await DoseLog.find({ profileId: profile.id, scheduledFor: slot, medicationId: { $in: alert.medicationIds } })
    .select("medicationId status")
    .lean();
  const statusById = new Map(logs.map((log) => [log.medicationId.toString(), log.status]));
  const outcomes = alert.medicationIds.map((id) => statusById.get(id.toString()));
  if (outcomes.some((status) => status !== "taken" && status !== "skipped" && status !== "missed")) return;

  const distinct = [...new Set(outcomes)];
  const resolution = distinct.length === 1 ? (distinct[0] as string) : "mixed";
  const result = await Alert.updateOne(
    { _id: alert._id, status: { $ne: "resolved" } },
    { $set: { status: "resolved", resolvedAt: new Date(), resolvedByName: actor.name, resolution } },
  );
  if (!result.modifiedCount) return;

  const outcome =
    resolution === "mixed" ? "updated" : `marked as ${resolution === "missed" ? "not taken" : resolution}`;
  await logActivity({
    profileId: profile.id,
    actorId: actor.id,
    actorName: actor.name,
    kind: "alert",
    message: `${formatTime12h(alert.localTime)} alert resolved: the medicines were ${outcome} by ${actor.name}`,
    status: "resolved",
    refId: doseRef(alert.slot),
  });
}

/** Called after a dose is undone: a resolved alert for that slot is open again. */
export async function reopenAlertForSlot(profile: ProfileDTO, slot: Date, actor: Actor): Promise<void> {
  const alert = await Alert.findOne({ profileId: profile.id, slot, status: "resolved" }).lean();
  if (!alert) return;
  const status = alert.acknowledgedAt ? "acknowledged" : "open";
  await Alert.updateOne(
    { _id: alert._id },
    { $set: { status, resolvedAt: null, resolvedByName: null, resolution: null } },
  );
  await logActivity({
    profileId: profile.id,
    actorId: actor.id,
    actorName: actor.name,
    kind: "alert",
    message: `${actor.name} undid a dose, so the ${formatTime12h(alert.localTime)} alert is open again`,
    status,
    refId: doseRef(alert.slot),
  });
}

export interface AckLinkContext {
  alert: AlertDTO;
  profile: ProfileDTO;
  user: { id: string; name: string };
}

/**
 * Resolves an emailed "I'm on it" link. The token names one alert and one member; it only works while
 * that person is still in the care circle.
 */
export async function loadAckLink(token: string): Promise<AckLinkContext | null> {
  const claims = await verifyPurposeToken(token, ACK_ALERT_PURPOSE);
  if (!claims || typeof claims.alertId !== "string" || typeof claims.userId !== "string") return null;
  if (!mongoose.isValidObjectId(claims.alertId) || !mongoose.isValidObjectId(claims.userId)) return null;

  await connectDB();
  const alert = await Alert.findById(claims.alertId).lean();
  if (!alert) return null;
  const [profileDoc, user, member] = await Promise.all([
    Profile.findById(alert.profileId).lean(),
    User.findById(claims.userId).select("name").lean(),
    Membership.exists({ profileId: alert.profileId, userId: claims.userId }),
  ]);
  if (!profileDoc || !user || !member) return null;
  return { alert: toAlertDTO(alert), profile: toProfileDTO(profileDoc), user: { id: user._id.toString(), name: user.name } };
}
