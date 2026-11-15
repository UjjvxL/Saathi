"use server";

import mongoose from "mongoose";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { authorizeMember } from "@/lib/auth/guard";
import { DoseLog, Medication } from "@/lib/models";
import { describeSchedule, shiftDate, todayInZone } from "@/lib/schedule";
import {
  fieldErrors,
  medicationSchema,
  readForm,
  readFormList,
  scannedMedicineSchema,
  type FormState,
  type MedicationInput,
} from "@/lib/validation";
import { guarded } from "./helpers";

const MED_FIELDS = [
  "name",
  "dosage",
  "form",
  "instructions",
  "frequency",
  "startDate",
  "endDate",
  "stock",
  "unitsPerDose",
  "refillThreshold",
] as const;

function parseMedicationForm(formData: FormData) {
  const raw = readForm(formData, MED_FIELDS);
  const result = medicationSchema.safeParse({
    ...raw,
    times: readFormList(formData, "times"),
    daysOfWeek: readFormList(formData, "daysOfWeek"),
  });
  return { raw, result };
}

function label(med: { name: string; dosage?: string | null }): string {
  return [med.name, med.dosage].filter(Boolean).join(" ");
}

/** Fields that decide which doses exist. Changing them restarts "expected doses" from now. */
function scheduleSignature(med: Pick<MedicationInput, "times" | "frequency" | "daysOfWeek" | "startDate">): string {
  return JSON.stringify([[...med.times].sort(), med.frequency, [...med.daysOfWeek].sort(), med.startDate]);
}

export async function createMedication(profileId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  return guarded(async () => {
    const context = await authorizeMember(profileId);
    const { raw, result } = parseMedicationForm(formData);
    if (!result.success) return { errors: fieldErrors(result.error), values: raw };

    await Medication.create({
      ...result.data,
      profileId,
      scheduleChangedAt: new Date(),
      createdBy: context.user.id,
      updatedBy: context.user.id,
    });
    await logActivity({
      profileId,
      actorId: context.user.id,
      actorName: context.user.name,
      kind: "medication",
      message: `${context.user.name} added ${label(result.data)} (${describeSchedule(result.data)})`,
    });
    redirect(`/p/${profileId}/medications`);
  });
}

export async function updateMedication(
  profileId: string,
  medicationId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  return guarded(async () => {
    const context = await authorizeMember(profileId);
    if (!mongoose.isValidObjectId(medicationId)) return { message: "This medicine no longer exists." };
    const existing = await Medication.findOne({ _id: medicationId, profileId }).lean();
    if (!existing) return { message: "This medicine no longer exists." };

    const { raw, result } = parseMedicationForm(formData);
    if (!result.success) return { errors: fieldErrors(result.error), values: raw };

    const scheduleChanged =
      scheduleSignature({
        times: existing.times,
        frequency: existing.frequency === "specific_days" ? "specific_days" : "daily",
        daysOfWeek: existing.daysOfWeek ?? [],
        startDate: existing.startDate,
      }) !== scheduleSignature(result.data);

    await Medication.updateOne(
      { _id: medicationId, profileId },
      {
        $set: {
          ...result.data,
          updatedBy: context.user.id,
          ...(scheduleChanged ? { scheduleChangedAt: new Date() } : {}),
        },
      },
    );
    await logActivity({
      profileId,
      actorId: context.user.id,
      actorName: context.user.name,
      kind: "medication",
      message: `${context.user.name} updated ${label(result.data)}${scheduleChanged ? ` (now ${describeSchedule(result.data)})` : ""}`,
    });
    redirect(`/p/${profileId}/medications`);
  });
}

export async function setMedicationActive(
  profileId: string,
  medicationId: string,
  active: boolean,
  _prev: FormState,
  _formData: FormData,
): Promise<FormState> {
  return guarded(async () => {
    const context = await authorizeMember(profileId);
    if (!mongoose.isValidObjectId(medicationId)) return { message: "This medicine no longer exists." };
    const med = await Medication.findOne({ _id: medicationId, profileId }).lean();
    if (!med) return { message: "This medicine no longer exists." };

    const today = todayInZone(context.profile.timezone);
    const update = active
      ? {
          active: true,
          endDate: med.endDate && med.endDate < today ? null : med.endDate,
          scheduleChangedAt: new Date(),
        }
      : { active: false, endDate: med.endDate && med.endDate < today ? med.endDate : today };
    await Medication.updateOne({ _id: medicationId }, { $set: { ...update, updatedBy: context.user.id } });
    await logActivity({
      profileId,
      actorId: context.user.id,
      actorName: context.user.name,
      kind: "medication",
      message: `${context.user.name} ${active ? "restarted" : "stopped"} ${label(med)}`,
    });
    refresh();
    return { ok: true };
  });
}

export async function deleteMedication(profileId: string, medicationId: string, _prev: FormState, _formData: FormData): Promise<FormState> {
  return guarded(async () => {
    const context = await authorizeMember(profileId);
    if (!mongoose.isValidObjectId(medicationId)) return { message: "This medicine no longer exists." };
    const med = await Medication.findOneAndDelete({ _id: medicationId, profileId }).lean();
    if (med) {
      await DoseLog.deleteMany({ medicationId });
      await logActivity({
        profileId,
        actorId: context.user.id,
        actorName: context.user.name,
        kind: "medication",
        message: `${context.user.name} deleted ${label(med)} and its dose history`,
      });
    }
    redirect(`/p/${profileId}/medications`);
  });
}

const refillSchema = z.object({
  amount: z.coerce.number().int("Enter a whole number").min(1, "Enter at least 1").max(10_000),
});

export async function addStock(profileId: string, medicationId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  return guarded(async () => {
    const context = await authorizeMember(profileId);
    const parsed = refillSchema.safeParse(readForm(formData, ["amount"] as const));
    if (!parsed.success) return { errors: fieldErrors(parsed.error) };
    if (!mongoose.isValidObjectId(medicationId)) return { message: "This medicine no longer exists." };
    const med = await Medication.findOne({ _id: medicationId, profileId }).lean();
    if (!med) return { message: "This medicine no longer exists." };

    const newStock = (med.stock ?? 0) + parsed.data.amount;
    await Medication.updateOne({ _id: medicationId }, { $set: { stock: newStock, updatedBy: context.user.id } });
    await logActivity({
      profileId,
      actorId: context.user.id,
      actorName: context.user.name,
      kind: "medication",
      message: `${context.user.name} added ${parsed.data.amount} to ${label(med)} stock (now ${newStock})`,
    });
    refresh();
    return { ok: true, message: `Stock is now ${newStock}.` };
  });
}

const scannedPayloadSchema = z.array(scannedMedicineSchema).min(1, "Select at least one medicine").max(20);

/** Saves medicines suggested by the AI prescription reader, after a person has reviewed them. */
export async function addScannedMedications(profileId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  return guarded(async () => {
    const context = await authorizeMember(profileId);
    let payload: unknown;
    try {
      payload = JSON.parse(String(formData.get("payload") ?? "[]"));
    } catch {
      return { message: "Something went wrong reading the list. Please scan again." };
    }
    const parsed = scannedPayloadSchema.safeParse(payload);
    if (!parsed.success) return { message: parsed.error.issues[0]?.message ?? "Please check the list." };

    const today = todayInZone(context.profile.timezone);
    const docs: MedicationInput[] = [];
    for (const medicine of parsed.data) {
      const result = medicationSchema.safeParse({
        name: medicine.name,
        dosage: medicine.dosage,
        form: medicine.form,
        instructions: medicine.instructions,
        times: medicine.times,
        frequency: "daily",
        daysOfWeek: [],
        startDate: today,
        endDate: medicine.durationDays ? shiftDate(today, medicine.durationDays - 1) : "",
        stock: "",
        unitsPerDose: "",
        refillThreshold: "",
      });
      if (!result.success) {
        return { message: `Please check “${medicine.name}”: ${result.error.issues[0]?.message ?? "invalid details"}.` };
      }
      docs.push(result.data);
    }

    const now = new Date();
    await Medication.insertMany(
      docs.map((doc) => ({
        ...doc,
        profileId,
        scheduleChangedAt: now,
        createdBy: context.user.id,
        updatedBy: context.user.id,
      })),
    );
    await logActivity({
      profileId,
      actorId: context.user.id,
      actorName: context.user.name,
      kind: "medication",
      message: `${context.user.name} added ${docs.length} medicine${docs.length === 1 ? "" : "s"} from a scanned prescription: ${docs.map(label).join(", ")}`,
    });
    redirect(`/p/${profileId}/medications`);
  });
}
