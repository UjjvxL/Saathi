import "server-only";
import {
  APPOINTMENT_STATUSES,
  DEFAULT_ESCALATE_AFTER_MINUTES,
  DEFAULT_MISSED_AFTER_MINUTES,
  FREQUENCIES,
  MED_FORMS,
  ROLES,
  type AppointmentStatus,
  type Frequency,
  type MedForm,
  type Role,
} from "./constants";
import type { ScheduleLike } from "./schedule";
import type { ActivityDTO, AppointmentDTO, MedicationDTO, MembershipDTO, ProfileDTO } from "./types";

// Mongoose "lean" documents are mapped to plain DTOs before they reach components.
type Id = { toString(): string };

function oneOf<T extends string>(values: readonly T[], value: unknown, fallback: T): T {
  return values.includes(value as T) ? (value as T) : fallback;
}

export function toProfileDTO(doc: {
  _id: Id;
  name: string;
  careId: string;
  timezone: string;
  elderEmail?: string | null;
  dateOfBirth?: string | null;
  conditions?: string[] | null;
  allergies?: string[] | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  missedAfterMinutes?: number | null;
  escalateAfterMinutes?: number | null;
  passcodeUpdatedAt: Date;
}): ProfileDTO {
  return {
    id: doc._id.toString(),
    name: doc.name,
    careId: doc.careId,
    timezone: doc.timezone,
    elderEmail: doc.elderEmail ?? null,
    dateOfBirth: doc.dateOfBirth ?? null,
    conditions: [...(doc.conditions ?? [])],
    allergies: [...(doc.allergies ?? [])],
    emergencyContactName: doc.emergencyContactName ?? null,
    emergencyContactPhone: doc.emergencyContactPhone ?? null,
    missedAfterMinutes: doc.missedAfterMinutes ?? DEFAULT_MISSED_AFTER_MINUTES,
    escalateAfterMinutes: doc.escalateAfterMinutes ?? DEFAULT_ESCALATE_AFTER_MINUTES,
    passcodeUpdatedAt: doc.passcodeUpdatedAt.toISOString(),
  };
}

export function toMembershipDTO(doc: {
  _id: Id;
  role: string;
  isAdmin?: boolean | null;
  emailAlerts?: boolean | null;
}): MembershipDTO {
  return {
    id: doc._id.toString(),
    role: oneOf<Role>(ROLES, doc.role, "family"),
    isAdmin: Boolean(doc.isAdmin),
    emailAlerts: doc.emailAlerts ?? true,
  };
}

export function toMedicationDTO(doc: {
  _id: Id;
  name: string;
  dosage?: string | null;
  form?: string | null;
  instructions?: string | null;
  times: string[];
  frequency?: string | null;
  daysOfWeek?: number[] | null;
  startDate: string;
  endDate?: string | null;
  stock?: number | null;
  unitsPerDose?: number | null;
  refillThreshold?: number | null;
  active?: boolean | null;
  scheduleChangedAt?: Date | null;
  createdAt?: Date | null;
}): MedicationDTO {
  return {
    id: doc._id.toString(),
    name: doc.name,
    dosage: doc.dosage ?? "",
    form: oneOf<MedForm>(MED_FORMS, doc.form, "tablet"),
    instructions: doc.instructions ?? "",
    times: [...doc.times].sort(),
    frequency: oneOf<Frequency>(FREQUENCIES, doc.frequency, "daily"),
    daysOfWeek: [...(doc.daysOfWeek ?? [])],
    startDate: doc.startDate,
    endDate: doc.endDate ?? null,
    stock: doc.stock ?? null,
    unitsPerDose: doc.unitsPerDose ?? 1,
    refillThreshold: doc.refillThreshold ?? null,
    active: doc.active ?? true,
    scheduleChangedAt: (doc.scheduleChangedAt ?? doc.createdAt ?? new Date(0)).toISOString(),
  };
}

export function toSchedule(med: MedicationDTO): ScheduleLike {
  return {
    id: med.id,
    times: med.times,
    frequency: med.frequency,
    daysOfWeek: med.daysOfWeek,
    startDate: med.startDate,
    endDate: med.endDate,
    activeFrom: new Date(med.scheduleChangedAt),
  };
}

export function toAppointmentDTO(doc: {
  _id: Id;
  doctorName: string;
  specialty?: string | null;
  location?: string | null;
  dateTime: Date;
  notes?: string | null;
  status?: string | null;
}): AppointmentDTO {
  return {
    id: doc._id.toString(),
    doctorName: doc.doctorName,
    specialty: doc.specialty ?? "",
    location: doc.location ?? "",
    dateTime: doc.dateTime.toISOString(),
    notes: doc.notes ?? "",
    status: oneOf<AppointmentStatus>(APPOINTMENT_STATUSES, doc.status, "scheduled"),
  };
}

export function toActivityDTO(doc: {
  _id: Id;
  actorName: string;
  kind: string;
  message: string;
  createdAt?: Date | null;
}): ActivityDTO {
  return {
    id: doc._id.toString(),
    actorName: doc.actorName,
    kind: doc.kind,
    message: doc.message,
    createdAt: (doc.createdAt ?? new Date(0)).toISOString(),
  };
}
