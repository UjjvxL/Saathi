// Plain data shapes passed from server code to components (no Mongoose types, ids as strings).
import type { AppointmentStatus, DoseStatus, Frequency, MedForm, Role } from "./constants";

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
  missedAfterMinutes: number;
  escalateAfterMinutes: number;
  passcodeUpdatedAt: string;
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
  /** Whether "taken"/"skipped" can be recorded now (due, missed, or at most 2 hours early). */
  canMark: boolean;
  takenAt: string | null;
  loggedByName: string | null;
}

export interface ActivityDTO {
  id: string;
  actorName: string;
  kind: string;
  message: string;
  createdAt: string;
}

/** Everything a page needs after confirming the current user belongs to a profile. */
export interface MemberContext {
  user: CurrentUser;
  profile: ProfileDTO;
  membership: MembershipDTO;
}
