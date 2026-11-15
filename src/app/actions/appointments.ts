"use server";

import mongoose from "mongoose";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { logActivity } from "@/lib/activity";
import { authorizeMember } from "@/lib/auth/guard";
import { APPOINTMENT_STATUSES, type AppointmentStatus } from "@/lib/constants";
import { Appointment } from "@/lib/models";
import { can } from "@/lib/permissions";
import { checkAssignee, logAssignment } from "@/lib/responsibilities";
import { formatInstant, zonedToUtc } from "@/lib/schedule";
import type { MemberContext } from "@/lib/types";
import { appointmentSchema, fieldErrors, readForm, type FormState } from "@/lib/validation";
import { guarded } from "./helpers";

const APPOINTMENT_FIELDS = ["doctorName", "specialty", "location", "date", "time", "notes", "assigneeId"] as const;

type Parsed =
  | { ok: false; state: FormState }
  | {
      ok: true;
      details: { doctorName: string; specialty: string; location: string; notes: string };
      dateTime: Date;
      assignee: { id: string; name: string } | null;
    };

async function parseAppointmentForm(context: MemberContext, formData: FormData, previousAssignee: string | null): Promise<Parsed> {
  const raw = readForm(formData, APPOINTMENT_FIELDS);
  const parsed = appointmentSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, state: { errors: fieldErrors(parsed.error), values: raw } };
  const { date, time, assigneeId, ...details } = parsed.data;
  const assigned = await checkAssignee(context.profile.id, assigneeId);
  if (!assigned.ok) return { ok: false, state: { errors: { assigneeId: [assigned.message] }, values: raw } };
  if ((assigned.assignee?.id ?? null) !== previousAssignee && !can(context.membership, "assignResponsibilities")) {
    return { ok: false, state: { errors: { assigneeId: ["Only caretakers and admins can assign responsibilities."] }, values: raw } };
  }
  return { ok: true, details, dateTime: zonedToUtc(date, time, context.profile.timezone), assignee: assigned.assignee };
}

export async function createAppointment(profileId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  return guarded(async () => {
    const context = await authorizeMember(profileId, { capability: "manageAppointments" });
    const parsed = await parseAppointmentForm(context, formData, null);
    if (!parsed.ok) return parsed.state;

    const { details, dateTime, assignee } = parsed;
    const appointment = await Appointment.create({
      ...details,
      profileId,
      dateTime,
      assigneeId: assignee?.id ?? null,
      createdBy: context.user.id,
      updatedBy: context.user.id,
    });
    const refId = `appointment:${appointment._id.toString()}`;
    await logActivity({
      profileId,
      actorId: context.user.id,
      actorName: context.user.name,
      kind: "appointment",
      message: `${context.user.name} added an appointment with ${details.doctorName} on ${formatInstant(dateTime, context.profile.timezone)}`,
      status: "scheduled",
      refId,
    });
    await logAssignment({
      profileId,
      actor: context.user,
      what: `the visit to ${details.doctorName}`,
      refId,
      assignee,
    });
    refresh();
    const upcoming = dateTime.getTime() > Date.now();
    return {
      ok: true,
      message: upcoming
        ? "Appointment added. Everyone in the care circle will get reminders 1 day and 2 hours before."
        : "Past appointment saved to the record.",
    };
  });
}

export async function updateAppointment(
  profileId: string,
  appointmentId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  return guarded(async () => {
    const context = await authorizeMember(profileId, { capability: "manageAppointments" });
    if (!mongoose.isValidObjectId(appointmentId)) return { message: "This appointment no longer exists." };
    const existing = await Appointment.findOne({ _id: appointmentId, profileId }).lean();
    if (!existing) return { message: "This appointment no longer exists." };

    const previousAssignee = existing.assigneeId ? existing.assigneeId.toString() : null;
    const parsed = await parseAppointmentForm(context, formData, previousAssignee);
    if (!parsed.ok) return parsed.state;

    const { details, dateTime, assignee } = parsed;
    await Appointment.updateOne(
      { _id: appointmentId, profileId },
      { $set: { ...details, dateTime, assigneeId: assignee?.id ?? null, updatedBy: context.user.id } },
    );
    const refId = `appointment:${appointmentId}`;
    await logActivity({
      profileId,
      actorId: context.user.id,
      actorName: context.user.name,
      kind: "appointment",
      message: `${context.user.name} updated the appointment with ${details.doctorName} (${formatInstant(dateTime, context.profile.timezone)})`,
      status: existing.status ?? "scheduled",
      refId,
    });
    await logAssignment({
      profileId,
      actor: context.user,
      what: `the visit to ${details.doctorName}`,
      refId,
      assignee,
      previousId: previousAssignee,
    });
    redirect(`/p/${profileId}/appointments`);
  });
}

export async function setAppointmentStatus(
  profileId: string,
  appointmentId: string,
  status: AppointmentStatus,
  _prev: FormState,
  _formData: FormData,
): Promise<FormState> {
  return guarded(async () => {
    const context = await authorizeMember(profileId, { capability: "manageAppointments" });
    if (!APPOINTMENT_STATUSES.includes(status) || !mongoose.isValidObjectId(appointmentId)) {
      return { message: "Unknown appointment." };
    }
    const appointment = await Appointment.findOneAndUpdate(
      { _id: appointmentId, profileId },
      {
        $set: {
          status,
          updatedBy: context.user.id,
          statusChangedAt: new Date(),
          statusChangedByName: context.user.name,
        },
      },
    ).lean();
    if (!appointment) return { message: "This appointment no longer exists." };

    const verb = status === "completed" ? "marked as done" : status === "cancelled" ? "cancelled" : "restored";
    const assigneeId = appointment.assigneeId ? appointment.assigneeId.toString() : null;
    await logActivity({
      profileId,
      actorId: context.user.id,
      actorName: context.user.name,
      // Completing a visit someone was responsible for closes that responsibility.
      kind: status === "completed" && assigneeId ? "responsibility" : "appointment",
      message: `${context.user.name} ${verb} the appointment with ${appointment.doctorName}`,
      status,
      refId: `appointment:${appointmentId}`,
      involvedUserIds: [assigneeId],
    });
    refresh();
    return { ok: true };
  });
}

export async function deleteAppointment(profileId: string, appointmentId: string, _prev: FormState, _formData: FormData): Promise<FormState> {
  return guarded(async () => {
    const context = await authorizeMember(profileId, { capability: "manageAppointments" });
    if (!mongoose.isValidObjectId(appointmentId)) return { message: "Unknown appointment." };
    const appointment = await Appointment.findOneAndDelete({ _id: appointmentId, profileId }).lean();
    if (appointment) {
      await logActivity({
        profileId,
        actorId: context.user.id,
        actorName: context.user.name,
        kind: "appointment",
        message: `${context.user.name} deleted the appointment with ${appointment.doctorName}`,
        status: "deleted",
        refId: `appointment:${appointmentId}`,
      });
    }
    refresh();
    return { ok: true };
  });
}
