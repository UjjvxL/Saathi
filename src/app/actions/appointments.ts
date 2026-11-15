"use server";

import mongoose from "mongoose";
import { refresh } from "next/cache";
import { logActivity } from "@/lib/activity";
import { authorizeMember } from "@/lib/auth/guard";
import { APPOINTMENT_STATUSES, type AppointmentStatus } from "@/lib/constants";
import { Appointment } from "@/lib/models";
import { formatInstant, zonedToUtc } from "@/lib/schedule";
import { appointmentSchema, fieldErrors, readForm, type FormState } from "@/lib/validation";
import { guarded } from "./helpers";

export async function createAppointment(profileId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  return guarded(async () => {
    const context = await authorizeMember(profileId);
    const raw = readForm(formData, ["doctorName", "specialty", "location", "date", "time", "notes"] as const);
    const parsed = appointmentSchema.safeParse(raw);
    if (!parsed.success) return { errors: fieldErrors(parsed.error), values: raw };

    const { date, time, ...details } = parsed.data;
    const dateTime = zonedToUtc(date, time, context.profile.timezone);
    await Appointment.create({
      ...details,
      profileId,
      dateTime,
      createdBy: context.user.id,
      updatedBy: context.user.id,
    });
    await logActivity({
      profileId,
      actorId: context.user.id,
      actorName: context.user.name,
      kind: "appointment",
      message: `${context.user.name} added an appointment with ${details.doctorName} on ${formatInstant(dateTime, context.profile.timezone)}`,
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

export async function setAppointmentStatus(
  profileId: string,
  appointmentId: string,
  status: AppointmentStatus,
  _prev: FormState,
  _formData: FormData,
): Promise<FormState> {
  return guarded(async () => {
    const context = await authorizeMember(profileId);
    if (!APPOINTMENT_STATUSES.includes(status) || !mongoose.isValidObjectId(appointmentId)) {
      return { message: "Unknown appointment." };
    }
    const appointment = await Appointment.findOneAndUpdate(
      { _id: appointmentId, profileId },
      { $set: { status, updatedBy: context.user.id } },
    ).lean();
    if (!appointment) return { message: "This appointment no longer exists." };

    const verb = status === "completed" ? "marked as done" : status === "cancelled" ? "cancelled" : "restored";
    await logActivity({
      profileId,
      actorId: context.user.id,
      actorName: context.user.name,
      kind: "appointment",
      message: `${context.user.name} ${verb} the appointment with ${appointment.doctorName}`,
    });
    refresh();
    return { ok: true };
  });
}

export async function deleteAppointment(profileId: string, appointmentId: string, _prev: FormState, _formData: FormData): Promise<FormState> {
  return guarded(async () => {
    const context = await authorizeMember(profileId);
    if (!mongoose.isValidObjectId(appointmentId)) return { message: "Unknown appointment." };
    const appointment = await Appointment.findOneAndDelete({ _id: appointmentId, profileId }).lean();
    if (appointment) {
      await logActivity({
        profileId,
        actorId: context.user.id,
        actorName: context.user.name,
        kind: "appointment",
        message: `${context.user.name} deleted the appointment with ${appointment.doctorName}`,
      });
    }
    refresh();
    return { ok: true };
  });
}
