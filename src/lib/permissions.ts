// Role-based permissions for a care circle. Safe to import from server and client code: the server
// enforces these in every action (see lib/auth/guard.ts); the UI only uses them to hide what won't work.
import type { Role } from "./constants";

export const CAPABILITIES = [
  "logDoses",
  "acknowledgeAlerts",
  "manageAppointments",
  "manageMedications",
  "assignResponsibilities",
  "manageCircle",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

export const CAPABILITY_LABELS: Record<Capability, string> = {
  logDoses: "Confirm doses (taken, skipped or missed)",
  acknowledgeAlerts: "Acknowledge alerts and follow up",
  manageAppointments: "Add and edit doctor appointments",
  manageMedications: "Add and edit medicine schedules",
  assignResponsibilities: "Assign responsibilities to members",
  manageCircle: "Manage members, invitations and settings",
};

/** What each role can do without being an admin. Admins (always including the elder) can do everything. */
const ROLE_CAPABILITIES: Record<Role, readonly Capability[]> = {
  elder: CAPABILITIES,
  caretaker: ["logDoses", "acknowledgeAlerts", "manageAppointments", "manageMedications", "assignResponsibilities"],
  family: ["logDoses", "acknowledgeAlerts", "manageAppointments"],
};

export const FORBIDDEN_MESSAGES: Record<Capability, string> = {
  logDoses: "You can’t update doses in this care circle.",
  acknowledgeAlerts: "You can’t acknowledge alerts in this care circle.",
  manageAppointments: "Only caretakers, family and admins can change appointments.",
  manageMedications: "Only caretakers and admins can change medicine schedules.",
  assignResponsibilities: "Only caretakers and admins can assign responsibilities.",
  manageCircle: "Only care-circle admins can do this.",
};

export interface PermissionHolder {
  role: Role;
  isAdmin: boolean;
}

export function can(member: PermissionHolder, capability: Capability): boolean {
  return member.isAdmin || ROLE_CAPABILITIES[member.role].includes(capability);
}

/** The permission matrix shown on the Care circle page. */
export function capabilityMatrix(): { capability: Capability; label: string; admin: boolean; caretaker: boolean; family: boolean }[] {
  return CAPABILITIES.map((capability) => ({
    capability,
    label: CAPABILITY_LABELS[capability],
    admin: true,
    caretaker: ROLE_CAPABILITIES.caretaker.includes(capability),
    family: ROLE_CAPABILITIES.family.includes(capability),
  }));
}
