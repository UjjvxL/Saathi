import "server-only";
import {
  ACTIVITY_KINDS,
  ALERT_STATUSES,
  APPOINTMENT_STATUSES,
  DEFAULT_ESCALATE_AFTER_MINUTES,
  DEFAULT_FOLLOW_UP_MINUTES,
  FREQUENCIES,
  INVITE_TTL_DAYS,
  MED_FORMS,
  ROLES,
  type ActivityKind,
  type AlertStatus,
  type AppointmentStatus,
  type Frequency,
  type MedForm,
  type Role,
} from "./constants";
import type { ScheduleLike } from "./schedule";
import type { ActivityDTO, AlertDTO, AppointmentDTO, MedicationDTO, MembershipDTO, ProfileDTO } from "./types";

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
  followUpAfterMinutes?: number | null;
  escalateAfterMinutes?: number | null;
  passcodeUpdatedAt: Date;
  passcodeExpiresAt?: Date | null;
  createdBy?: Id | null;
}): ProfileDTO {
  const expiresAt =
    doc.passcodeExpiresAt ?? new Date(doc.passcodeUpdatedAt.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
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
    followUpAfterMinutes: doc.followUpAfterMinutes ?? DEFAULT_FOLLOW_UP_MINUTES,
    escalateAfterMinutes: doc.escalateAfterMinutes ?? DEFAULT_ESCALATE_AFTER_MINUTES,
    passcodeUpdatedAt: doc.passcodeUpdatedAt.toISOString(),
    passcodeExpiresAt: expiresAt.toISOString(),
    createdBy: doc.createdBy ? doc.createdBy.toString() : "",
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
  assigneeId?: Id | null;
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
    assigneeId: doc.assigneeId ? doc.assigneeId.toString() : null,
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
  assigneeId?: Id | null;
  statusChangedAt?: Date | null;
  statusChangedByName?: string | null;
}): AppointmentDTO {
  return {
    id: doc._id.toString(),
    doctorName: doc.doctorName,
    specialty: doc.specialty ?? "",
    location: doc.location ?? "",
    dateTime: doc.dateTime.toISOString(),
    notes: doc.notes ?? "",
    status: oneOf<AppointmentStatus>(APPOINTMENT_STATUSES, doc.status, "scheduled"),
    assigneeId: doc.assigneeId ? doc.assigneeId.toString() : null,
    statusChangedAt: doc.statusChangedAt ? doc.statusChangedAt.toISOString() : null,
    statusChangedByName: doc.statusChangedByName ?? null,
  };
}

export function toActivityDTO(doc: {
  _id: Id;
  actorId?: Id | null;
  actorName: string;
  kind: string;
  message: string;
  status?: string | null;
  refId?: string | null;
  createdAt?: Date | null;
}): ActivityDTO {
  return {
    id: doc._id.toString(),
    actorId: doc.actorId ? doc.actorId.toString() : null,
    actorName: doc.actorName,
    kind: oneOf<ActivityKind>(ACTIVITY_KINDS, doc.kind, "profile"),
    message: doc.message,
    status: doc.status ?? null,
    refId: doc.refId ?? null,
    createdAt: (doc.createdAt ?? new Date(0)).toISOString(),
  };
}

const iso = (date: Date | null | undefined): string | null => (date ? date.toISOString() : null);

export function toAlertDTO(doc: {
  _id: Id;
  slot: Date;
  localDate: string;
  localTime: string;
  medicationIds?: Id[] | null;
  medicines?: string[] | null;
  status?: string | null;
  reminderSentAt?: Date | null;
  followUpSentAt?: Date | null;
  escalatedAt: Date;
  notifiedUserIds?: Id[] | null;
  notifiedNames?: string[] | null;
  widenedAt?: Date | null;
  widenedNames?: string[] | null;
  acknowledgedAt?: Date | null;
  acknowledgedByName?: string | null;
  resolvedAt?: Date | null;
  resolvedByName?: string | null;
  resolution?: string | null;
}): AlertDTO {
  return {
    id: doc._id.toString(),
    slot: doc.slot.toISOString(),
    localDate: doc.localDate,
    localTime: doc.localTime,
    medicationIds: (doc.medicationIds ?? []).map((id) => id.toString()),
    medicines: [...(doc.medicines ?? [])],
    status: oneOf<AlertStatus>(ALERT_STATUSES, doc.status, "open"),
    reminderSentAt: iso(doc.reminderSentAt),
    followUpSentAt: iso(doc.followUpSentAt),
    escalatedAt: doc.escalatedAt.toISOString(),
    notifiedUserIds: (doc.notifiedUserIds ?? []).map((id) => id.toString()),
    notifiedNames: [...(doc.notifiedNames ?? [])],
    widenedAt: iso(doc.widenedAt),
    widenedNames: [...(doc.widenedNames ?? [])],
    acknowledgedAt: iso(doc.acknowledgedAt),
    acknowledgedByName: doc.acknowledgedByName ?? null,
    resolvedAt: iso(doc.resolvedAt),
    resolvedByName: doc.resolvedByName ?? null,
    resolution: doc.resolution ?? null,
  };
}
