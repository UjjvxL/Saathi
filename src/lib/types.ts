// Plain data shapes passed from server code to components (no Mongoose types, ids as strings).
import type { ActivityKind, AlertStatus, AppointmentStatus, DoseStatus, Frequency, MedForm, Role } from "./constants";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
}

export interface ProfileDTO {
  id: string;
  name: string;
  careId: string;
  timezone: string;
  elderEmail: string | null;
  dateOfBirth: string | null;
  conditions: string[];
  allergies: string[];
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  followUpAfterMinutes: number;
  escalateAfterMinutes: number;
  passcodeUpdatedAt: string;
  /** ISO instant after which the current passcode no longer works. */
  passcodeExpiresAt: string;
  /** The user who created the profile (shown as the owner). */
  createdBy: string;
}

export interface MembershipDTO {
  id: string;
  role: Role;
  isAdmin: boolean;
  emailAlerts: boolean;
}

export interface MemberDTO extends MembershipDTO {
  userId: string;
  name: string;
  email: string;
  joinedAt: string;
}

export interface MedicationDTO {
  id: string;
  name: string;
  dosage: string;
  form: MedForm;
  instructions: string;
  times: string[];
  frequency: Frequency;
  daysOfWeek: number[];
  startDate: string;
  endDate: string | null;
  stock: number | null;
  unitsPerDose: number;
  refillThreshold: number | null;
  active: boolean;
  /** The member responsible for this medicine, if any. */
  assigneeId: string | null;
  /** ISO instant the schedule was created or last changed. */
  scheduleChangedAt: string;
}

export interface AppointmentDTO {
  id: string;
  doctorName: string;
  specialty: string;
  location: string;
  /** ISO instant */
  dateTime: string;
  notes: string;
  status: AppointmentStatus;
  /** The member responsible for this visit, if any. */
  assigneeId: string | null;
  /** When and by whom it was last marked done, cancelled or restored. */
  statusChangedAt: string | null;
  statusChangedByName: string | null;
}

export interface DoseItem {
  key: string;
  medicationId: string;
  name: string;
  dosage: string;
  form: MedForm;
  instructions: string;
  localDate: string;
  localTime: string;
  /** ISO instant */
  scheduledFor: string;
  status: DoseStatus;
  /** Whether a decision can be recorded now (from 2 hours early until 7 days after). */
  canMark: boolean;
  takenAt: string | null;
  loggedByName: string | null;
  /** ISO instant the status was last recorded. */
  loggedAt: string | null;
  /** The member responsible for this medicine, if any. */
  assigneeId: string | null;
  /** The escalation for this dose's time slot, if it was escalated. */
  alert: DoseAlertInfo | null;
}

export interface DoseAlertInfo {
  id: string;
  status: AlertStatus;
  acknowledgedByName: string | null;
  acknowledgedAt: string | null;
}

/** One escalated time slot, with every step of its follow-up. */
export interface AlertDTO {
  id: string;
  /** ISO instant the medicines were due. */
  slot: string;
  localDate: string;
  localTime: string;
  medicationIds: string[];
  medicines: string[];
  status: AlertStatus;
  reminderSentAt: string | null;
  followUpSentAt: string | null;
  escalatedAt: string;
  notifiedUserIds: string[];
  notifiedNames: string[];
  widenedAt: string | null;
  widenedNames: string[];
  acknowledgedAt: string | null;
  acknowledgedByName: string | null;
  resolvedAt: string | null;
  resolvedByName: string | null;
  resolution: string | null;
}

export interface ActivityDTO {
  id: string;
  actorId: string | null;
  actorName: string;
  kind: ActivityKind;
  message: string;
  /** Status of the dose, alert or task right after the event, if relevant. */
  status: string | null;
  refId: string | null;
  createdAt: string;
}

/** Everything a page needs after confirming the current user belongs to a profile. */
export interface MemberContext {
  user: CurrentUser;
  profile: ProfileDTO;
  membership: MembershipDTO;
}
