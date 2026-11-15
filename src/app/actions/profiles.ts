"use server";

import mongoose from "mongoose";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { logActivity } from "@/lib/activity";
import { getCurrentUser } from "@/lib/auth/dal";
import { authorizeMember, ForbiddenError } from "@/lib/auth/guard";
import { burnVerifyTime, hashSecret, verifySecret } from "@/lib/auth/password";
import { ROLE_LABELS } from "@/lib/constants";
import { connectDB, isDuplicateKeyError } from "@/lib/db";
import { toProfileDTO } from "@/lib/dto";
import { isEmailConfigured, sendEmail } from "@/lib/email/mailer";
import { testEmail } from "@/lib/email/templates";
import { env } from "@/lib/env";
import { Activity, Appointment, DoseLog, Medication, Membership, Profile, ReminderLog, User } from "@/lib/models";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { notifyMemberJoined, runReminders } from "@/lib/reminders";
import { generateCareId, generatePasscode } from "@/lib/security";
import {
  createProfileSchema,
  fieldErrors,
  joinSchema,
  profileSchema,
  readForm,
  reminderSettingsSchema,
  type FormState,
} from "@/lib/validation";
import { guarded } from "./helpers";

const PROFILE_FIELDS = [
  "name",
  "elderEmail",
  "dateOfBirth",
  "timezone",
  "conditions",
  "allergies",
  "emergencyContactName",
  "emergencyContactPhone",
] as const;

export interface CreateProfileState extends FormState {
  profileId?: string;
  careId?: string;
  passcode?: string;
}

export async function createProfile(_prev: CreateProfileState, formData: FormData): Promise<CreateProfileState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const raw = readForm(formData, [...PROFILE_FIELDS, "relationship"] as const);
  const parsed = createProfileSchema.safeParse(raw);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: raw };
  const { relationship, ...details } = parsed.data;

  await connectDB();
  const passcode = generatePasscode();
  const passcodeHash = await hashSecret(passcode);

  let profileId: string | null = null;
  let careId = "";
  for (let attempt = 0; attempt < 5 && !profileId; attempt++) {
    try {
      careId = generateCareId();
      const profile = await Profile.create({
        ...details,
        careId,
        passcodeHash,
        passcodeUpdatedAt: new Date(),
        createdBy: user.id,
      });
      profileId = profile._id.toString();
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error; // Care ID collision: try another one
    }
  }
  if (!profileId) return { message: "Couldn’t create the profile. Please try again.", values: raw };

  await Membership.create({ profileId, userId: user.id, role: relationship, isAdmin: true });
  await logActivity({
    profileId,
    actorId: user.id,
    actorName: user.name,
    kind: "profile",
    message: `${user.name} created this care profile`,
  });
  return { ok: true, profileId, careId, passcode };
}

export async function updateProfile(profileId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  return guarded(async () => {
    const context = await authorizeMember(profileId, { admin: true });
    const raw = readForm(formData, PROFILE_FIELDS);
    const parsed = profileSchema.safeParse(raw);
    if (!parsed.success) return { errors: fieldErrors(parsed.error), values: raw };

    await Profile.updateOne({ _id: profileId }, { $set: parsed.data });
    await logActivity({
      profileId,
      actorId: context.user.id,
      actorName: context.user.name,
      kind: "profile",
      message: `${context.user.name} updated the profile details`,
    });
    refresh();
    return { ok: true, message: "Profile saved." };
  });
}

export async function joinProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const raw = readForm(formData, ["careId", "passcode", "relationship"] as const);
  const values = { careId: raw.careId, relationship: raw.relationship };
  const parsed = joinSchema.safeParse(raw);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  const { careId, passcode, relationship } = parsed.data;

  // A 6-digit passcode is only safe with strict attempt limits.
  const [byProfile, byUser, byIp] = await Promise.all([
    rateLimit(`join:${careId}`, 5, 15 * 60),
    rateLimit(`join-user:${user.id}`, 10, 60 * 60),
    rateLimit(`join-ip:${await clientIp()}`, 30, 60 * 60),
  ]);
  if (!byProfile.allowed || !byUser.allowed || !byIp.allowed) {
    return { message: "Too many attempts. For safety, please wait 15 minutes and try again.", values };
  }

  await connectDB();
  const profileDoc = await Profile.findOne({ careId }).lean();
  let valid = false;
  if (profileDoc) valid = await verifySecret(passcode, profileDoc.passcodeHash);
  else await burnVerifyTime(passcode);
  if (!profileDoc || !valid) {
    return { message: "That Care ID and passcode don’t match. Check with the person who shared them.", values };
  }

  const profileId = profileDoc._id.toString();
  const alreadyMember = await Membership.exists({ profileId, userId: user.id });
  if (!alreadyMember) {
    if (relationship === "elder" && (await Membership.exists({ profileId, role: "elder" }))) {
      return {
        errors: { relationship: ["This profile already has an elder account. Join as a caretaker or family member."] },
        values,
      };
    }
    try {
      // The elder is always an admin of their own care circle.
      await Membership.create({ profileId, userId: user.id, role: relationship, isAdmin: relationship === "elder" });
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
    }
    await logActivity({
      profileId,
      actorId: user.id,
      actorName: user.name,
      kind: "member",
      message: `${user.name} joined as ${ROLE_LABELS[relationship].toLowerCase()}`,
    });
    try {
      await notifyMemberJoined(toProfileDTO(profileDoc), user.name, relationship, user.id);
    } catch (error) {
      console.error("[join] could not send join notification", error);
    }
  }
  redirect(`/p/${profileId}`);
}

export interface PasscodeState extends FormState {
  passcode?: string;
}

export async function regeneratePasscode(profileId: string, _prev: PasscodeState, _formData: FormData): Promise<PasscodeState> {
  return guarded(async () => {
    const context = await authorizeMember(profileId, { admin: true });
    const passcode = generatePasscode();
    await Profile.updateOne(
      { _id: profileId },
      { $set: { passcodeHash: await hashSecret(passcode), passcodeUpdatedAt: new Date() } },
    );
    await logActivity({
      profileId,
      actorId: context.user.id,
      actorName: context.user.name,
      kind: "profile",
      message: `${context.user.name} generated a new passcode (the old one no longer works)`,
    });
    return { ok: true, passcode };
  });
}

export async function removeMember(profileId: string, membershipId: string, _prev: FormState, _formData: FormData): Promise<FormState> {
  return guarded(async () => {
    const context = await authorizeMember(profileId, { admin: true });
    if (!mongoose.isValidObjectId(membershipId)) throw new ForbiddenError("That member couldn’t be found.");
    const target = await Membership.findOne({ _id: membershipId, profileId }).lean();
    if (!target) return { message: "That member has already left." };
    if (target.userId.toString() === context.user.id) {
      throw new ForbiddenError("To remove yourself, use “Leave this care circle”.");
    }
    if (target.role === "elder" && context.membership.role !== "elder") {
      throw new ForbiddenError("Only the elder can remove the elder’s own account.");
    }

    await Membership.deleteOne({ _id: membershipId });
    const removed = await User.findById(target.userId).select("name").lean();
    await logActivity({
      profileId,
      actorId: context.user.id,
      actorName: context.user.name,
      kind: "member",
      message: `${context.user.name} removed ${removed?.name ?? "a member"} from the care circle`,
    });
    refresh();
    return { ok: true, message: "Member removed." };
  });
}

export async function setAdmin(
  profileId: string,
  membershipId: string,
  makeAdmin: boolean,
  _prev: FormState,
  _formData: FormData,
): Promise<FormState> {
  return guarded(async () => {
    const context = await authorizeMember(profileId, { admin: true });
    if (!mongoose.isValidObjectId(membershipId)) throw new ForbiddenError("That member couldn’t be found.");
    const target = await Membership.findOne({ _id: membershipId, profileId }).lean();
    if (!target) return { message: "That member has left." };
    if (!makeAdmin && target.role === "elder") throw new ForbiddenError("The elder always stays an admin.");
    if (!makeAdmin && (await Membership.countDocuments({ profileId, isAdmin: true })) <= 1) {
      throw new ForbiddenError("A care circle needs at least one admin.");
    }

    await Membership.updateOne({ _id: membershipId }, { $set: { isAdmin: makeAdmin } });
    const user = await User.findById(target.userId).select("name").lean();
    await logActivity({
      profileId,
      actorId: context.user.id,
      actorName: context.user.name,
      kind: "member",
      message: `${context.user.name} ${makeAdmin ? "made" : "removed"} ${user?.name ?? "a member"} ${makeAdmin ? "an admin" : "as admin"}`,
    });
    refresh();
    return { ok: true };
  });
}

export async function leaveCircle(profileId: string, _prev: FormState, _formData: FormData): Promise<FormState> {
  const result = await guarded(async () => {
    const context = await authorizeMember(profileId);
    const others = await Membership.find({ profileId, userId: { $ne: context.user.id } }).lean();
    if (others.length && context.membership.isAdmin && !others.some((member) => member.isAdmin)) {
      throw new ForbiddenError("You’re the only admin. Make someone else an admin before leaving.");
    }

    await Membership.deleteOne({ profileId, userId: context.user.id });
    if (!others.length) {
      // Nobody can reach this profile any more, so remove its data entirely.
      await Promise.all([
        Profile.deleteOne({ _id: profileId }),
        Medication.deleteMany({ profileId }),
        DoseLog.deleteMany({ profileId }),
        Appointment.deleteMany({ profileId }),
        Activity.deleteMany({ profileId }),
        ReminderLog.deleteMany({ profileId }),
      ]);
    } else {
      await logActivity({
        profileId,
        actorId: context.user.id,
        actorName: context.user.name,
        kind: "member",
        message: `${context.user.name} left the care circle`,
      });
    }
    return { ok: true };
  });
  if (result.ok) redirect("/dashboard");
  return result;
}

export async function setEmailAlerts(profileId: string, enabled: boolean, _prev: FormState, _formData: FormData): Promise<FormState> {
  return guarded(async () => {
    const context = await authorizeMember(profileId);
    await Membership.updateOne({ profileId, userId: context.user.id }, { $set: { emailAlerts: enabled } });
    refresh();
    return { ok: true, message: enabled ? "Email alerts are on." : "Email alerts are off." };
  });
}

export async function updateReminderSettings(profileId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  return guarded(async () => {
    const context = await authorizeMember(profileId, { admin: true });
    const raw = readForm(formData, ["followUpAfterMinutes", "escalateAfterMinutes"] as const);
    const parsed = reminderSettingsSchema.safeParse(raw);
    if (!parsed.success) return { errors: fieldErrors(parsed.error), values: raw };

    await Profile.updateOne({ _id: profileId }, { $set: parsed.data });
    await logActivity({
      profileId,
      actorId: context.user.id,
      actorName: context.user.name,
      kind: "profile",
      message: `${context.user.name} changed reminder timing (follow-up after ${parsed.data.followUpAfterMinutes} min, caretaker alert after ${parsed.data.escalateAfterMinutes} min)`,
    });
    refresh();
    return { ok: true, message: "Reminder settings saved." };
  });
}

export async function sendTestEmail(profileId: string, _prev: FormState, _formData: FormData): Promise<FormState> {
  return guarded(async () => {
    const context = await authorizeMember(profileId);
    const limit = await rateLimit(`test-email:${context.user.id}`, 3, 60 * 60);
    if (!limit.allowed) return { message: "You’ve sent a few test emails already. Please try again later." };
    try {
      const mode = await sendEmail(context.user.email, testEmail({ name: context.user.name, appUrl: env.appUrl() }));
      return {
        ok: true,
        message:
          mode === "sent"
            ? `Test email sent to ${context.user.email}.`
            : "Email isn’t configured yet, so the message was printed in the server console instead.",
      };
    } catch (error) {
      console.error("[test-email] failed", error);
      return { message: "The email couldn’t be sent. Check the SMTP settings on the server." };
    }
  });
}

export async function runRemindersNow(profileId: string, _prev: FormState, _formData: FormData): Promise<FormState> {
  return guarded(async () => {
    await authorizeMember(profileId, { admin: true });
    const summary = await runReminders(new Date(), { profileId });
    const parts = [
      `${summary.upcoming} dose reminder${summary.upcoming === 1 ? "" : "s"}`,
      `${summary.missed} missed-dose nudge${summary.missed === 1 ? "" : "s"}`,
      `${summary.escalated} family alert${summary.escalated === 1 ? "" : "s"}`,
      `${summary.appointments} appointment reminder${summary.appointments === 1 ? "" : "s"}`,
      `${summary.lowStock} low-stock alert${summary.lowStock === 1 ? "" : "s"}`,
    ];
    refresh();
    return {
      ok: true,
      message: `Checked just now: ${parts.join(", ")}.${isEmailConfigured() ? "" : " (Email is in preview mode: see the server console.)"}`,
    };
  });
}
