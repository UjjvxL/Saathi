"use server";

import { refresh } from "next/cache";
import { findMemberContext } from "@/lib/auth/dal";
import { authorizeMember } from "@/lib/auth/guard";
import { verifyPurposeToken } from "@/lib/auth/jwt";
import { connectDB } from "@/lib/db";
import { recordDose, undoDose } from "@/lib/doses";
import { toMedicationDTO, toProfileDTO, toSchedule } from "@/lib/dto";
import { DoseLog, Medication, Profile } from "@/lib/models";
import { CONFIRM_DOSE_PURPOSE } from "@/lib/reminders";
import { isScheduledDose } from "@/lib/schedule";
import type { FormState } from "@/lib/validation";
import { guarded } from "./helpers";

type DoseDecision = "taken" | "skipped";

function isDecision(value: unknown): value is DoseDecision {
  return value === "taken" || value === "skipped";
}

export async function markDose(
  profileId: string,
  medicationId: string,
  scheduledForIso: string,
  status: DoseDecision,
  _prev: FormState,
  _formData: FormData,
): Promise<FormState> {
  return guarded(async () => {
    if (!isDecision(status)) return { message: "Unknown action." };
    const context = await authorizeMember(profileId);
    const outcome = await recordDose({
      profile: context.profile,
      medicationId,
      scheduledFor: new Date(scheduledForIso),
      status,
      actor: { id: context.user.id, name: context.user.name },
    });
    if (!outcome.ok) return { message: outcome.message };
    refresh();
    return { ok: true };
  });
}

export async function unmarkDose(
  profileId: string,
  medicationId: string,
  scheduledForIso: string,
  _prev: FormState,
  _formData: FormData,
): Promise<FormState> {
  return guarded(async () => {
    const context = await authorizeMember(profileId);
    const outcome = await undoDose({
      profile: context.profile,
      medicationId,
      scheduledFor: new Date(scheduledForIso),
      actor: { id: context.user.id, name: context.user.name },
    });
    if (!outcome.ok) return { message: outcome.message };
    refresh();
    return { ok: true };
  });
}

/** Marks every not-yet-logged medicine of one time slot at once ("I took all my 8 AM medicines"). */
export async function markSlot(
  profileId: string,
  slotIso: string,
  status: DoseDecision,
  _prev: FormState,
  _formData: FormData,
): Promise<FormState> {
  return guarded(async () => {
    if (!isDecision(status)) return { message: "Unknown action." };
    const context = await authorizeMember(profileId);
    const scheduledFor = new Date(slotIso);
    if (Number.isNaN(scheduledFor.getTime())) return { message: "Unknown time slot." };

    const meds = (await Medication.find({ profileId, active: true }).lean())
      .map(toMedicationDTO)
      .filter((med) => isScheduledDose(toSchedule(med), scheduledFor, context.profile.timezone));
    const loggedIds = new Set(
      (await DoseLog.find({ profileId, scheduledFor }).select("medicationId").lean()).map((log) =>
        log.medicationId.toString(),
      ),
    );
    for (const med of meds.filter((m) => !loggedIds.has(m.id))) {
      const outcome = await recordDose({
        profile: context.profile,
        medicationId: med.id,
        scheduledFor,
        status,
        actor: { id: context.user.id, name: context.user.name },
      });
      if (!outcome.ok) return { message: outcome.message };
    }
    refresh();
    return { ok: true };
  });
}

/**
 * "I've taken them" from a reminder email. The signed token (12h, single purpose) authorizes
 * marking the medicines of exactly one time slot, so the elder doesn't need to log in.
 */
export async function confirmDoseSlot(token: string, status: DoseDecision, _prev: FormState, _formData: FormData): Promise<FormState> {
  const expired: FormState = { message: "This link has expired. Please open the app to update today’s medicines." };
  if (!isDecision(status)) return { message: "Unknown action." };
  const claims = await verifyPurposeToken(token, CONFIRM_DOSE_PURPOSE);
  if (!claims || typeof claims.profileId !== "string" || typeof claims.slot !== "string") return expired;

  await connectDB();
  const profileDoc = await Profile.findById(claims.profileId).lean();
  if (!profileDoc) return expired;
  const profile = toProfileDTO(profileDoc);
  const scheduledFor = new Date(claims.slot);

  const meds = (await Medication.find({ profileId: profile.id, active: true }).lean())
    .map(toMedicationDTO)
    .filter((med) => isScheduledDose(toSchedule(med), scheduledFor, profile.timezone));
  if (!meds.length) return { message: "These medicines were changed since the email was sent. Please open the app." };

  // Credit the signed-in family member if they clicked; otherwise it was the elder from their inbox.
  const member = await findMemberContext(profile.id);
  const actor = member
    ? { id: member.user.id, name: member.user.name }
    : { id: null, name: `${profile.name} (email link)` };

  for (const med of meds) {
    const outcome = await recordDose({ profile, medicationId: med.id, scheduledFor, status, actor });
    if (!outcome.ok) return { message: outcome.message };
  }
  refresh();
  return {
    ok: true,
    message: status === "taken" ? "Thank you! They’re marked as taken and your family can see it." : "Okay, marked as skipped.",
  };
}
