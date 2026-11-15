import "server-only";
import mongoose, { Schema } from "mongoose";
import {
  ACTIVITY_KINDS,
  ALERT_STATUSES,
  APPOINTMENT_STATUSES,
  DEFAULT_ESCALATE_AFTER_MINUTES,
  DEFAULT_FOLLOW_UP_MINUTES,
  DEFAULT_TIMEZONE,
  DOSE_LOG_STATUSES,
  ESCALATE_RANGE,
  FOLLOW_UP_RANGE,
  FREQUENCIES,
  MED_FORMS,
  ROLES,
} from "./constants";

const { ObjectId } = Schema.Types;

/**
 * Compiles a model once and reuses it everywhere. Next.js can evaluate this module several times
 * (one copy per server bundle, plus hot reloads), and every copy must share the same model:
 * replacing a model before the database connects leaves the old copy unable to initialise.
 * (After changing a schema in development, restart `npm run dev`.)
 */
function defineModel<TSchema extends Schema>(name: string, schema: TSchema) {
  const existing = mongoose.models[name];
  const compiled = existing ? undefined : mongoose.model(name, schema);
  return (existing ?? compiled) as NonNullable<typeof compiled>;
}

// ---------------------------------------------------------------------------
// User: anyone who signs in (elder, caretaker or family member).
// ---------------------------------------------------------------------------
const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    passwordHash: { type: String, required: true },
    /** Increased when the password changes, which invalidates every existing session. */
    sessionVersion: { type: Number, default: 0 },
  },
  { timestamps: true },
);
export const User = defineModel("User", userSchema);

// ---------------------------------------------------------------------------
// Profile: one elder's healthcare profile, shared by a care circle.
// ---------------------------------------------------------------------------
const profileSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    elderEmail: { type: String, default: null, lowercase: true, trim: true },
    dateOfBirth: { type: String, default: null },
    conditions: { type: [String], default: [] },
    allergies: { type: [String], default: [] },
    emergencyContactName: { type: String, default: null },
    emergencyContactPhone: { type: String, default: null },
    timezone: { type: String, required: true, default: DEFAULT_TIMEZONE },
    /** Public 6-character ID that is shared together with the passcode. */
    careId: { type: String, required: true, unique: true },
    /** bcrypt hash of the 6-digit passcode. The passcode itself is never stored. */
    passcodeHash: { type: String, required: true },
    passcodeUpdatedAt: { type: Date, required: true },
    /** The passcode stops working after this (null: INVITE_TTL_DAYS after passcodeUpdatedAt). */
    passcodeExpiresAt: { type: Date, default: null },
    /** Minutes after a dose is due before a follow-up reminder goes out. */
    followUpAfterMinutes: {
      type: Number,
      default: DEFAULT_FOLLOW_UP_MINUTES,
      min: FOLLOW_UP_RANGE.min,
      max: FOLLOW_UP_RANGE.max,
    },
    /** Minutes after a dose is due before it counts as unconfirmed and the responsible people are alerted. */
    escalateAfterMinutes: {
      type: Number,
      default: DEFAULT_ESCALATE_AFTER_MINUTES,
      min: ESCALATE_RANGE.min,
      max: ESCALATE_RANGE.max,
    },
    createdBy: { type: ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);
export const Profile = defineModel("Profile", profileSchema);

// ---------------------------------------------------------------------------
// Membership: links a user to a profile with a role.
// ---------------------------------------------------------------------------
const membershipSchema = new Schema(
  {
    profileId: { type: ObjectId, ref: "Profile", required: true },
    userId: { type: ObjectId, ref: "User", required: true, index: true },
    role: { type: String, enum: ROLES, required: true },
    /** Admins can manage the circle (members, passcode, settings). The elder is always an admin. */
    isAdmin: { type: Boolean, default: false },
    emailAlerts: { type: Boolean, default: true },
  },
  { timestamps: true },
);
membershipSchema.index({ profileId: 1, userId: 1 }, { unique: true });
export const Membership = defineModel("Membership", membershipSchema);

// ---------------------------------------------------------------------------
// Medication: a medicine and its schedule.
// ---------------------------------------------------------------------------
const medicationSchema = new Schema(
  {
    profileId: { type: ObjectId, ref: "Profile", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    dosage: { type: String, default: "", trim: true, maxlength: 60 },
    form: { type: String, enum: MED_FORMS, default: "tablet" },
    instructions: { type: String, default: "", trim: true, maxlength: 300 },
    /** Local wall-clock times in the profile's timezone, "HH:mm". */
    times: { type: [String], required: true },
    frequency: { type: String, enum: FREQUENCIES, default: "daily" },
    /** ISO weekdays (1 = Monday … 7 = Sunday) when frequency is "specific_days". */
    daysOfWeek: { type: [Number], default: [] },
    startDate: { type: String, required: true },
    endDate: { type: String, default: null },
    /** Units in hand (tablets, ml, …). null means stock isn't tracked. */
    stock: { type: Number, default: null, min: 0 },
    unitsPerDose: { type: Number, default: 1, min: 0 },
    refillThreshold: { type: Number, default: null, min: 0 },
    active: { type: Boolean, default: true },
    /** The member responsible for making sure this medicine is taken (alerted first when a dose is unconfirmed). */
    assigneeId: { type: ObjectId, ref: "User", default: null },
    /** When the schedule was created or last changed. Earlier doses are not expected. */
    scheduleChangedAt: { type: Date, required: true },
    createdBy: { type: ObjectId, ref: "User", default: null },
    updatedBy: { type: ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);
export const Medication = defineModel("Medication", medicationSchema);

// ---------------------------------------------------------------------------
// DoseLog: what actually happened to one scheduled dose.
// ---------------------------------------------------------------------------
const doseLogSchema = new Schema(
  {
    profileId: { type: ObjectId, ref: "Profile", required: true },
    medicationId: { type: ObjectId, ref: "Medication", required: true },
    scheduledFor: { type: Date, required: true },
    localDate: { type: String, required: true },
    localTime: { type: String, required: true },
    status: { type: String, enum: DOSE_LOG_STATUSES, required: true },
    takenAt: { type: Date, default: null },
    loggedBy: { type: ObjectId, ref: "User", default: null },
    loggedByName: { type: String, default: null },
    /** Stock removed when this dose was marked taken, so an undo can put it back. */
    stockDeducted: { type: Number, default: 0 },
  },
  { timestamps: true },
);
doseLogSchema.index({ medicationId: 1, scheduledFor: 1 }, { unique: true });
doseLogSchema.index({ profileId: 1, localDate: 1 });
export const DoseLog = defineModel("DoseLog", doseLogSchema);

// ---------------------------------------------------------------------------
// Appointment: a doctor visit.
// ---------------------------------------------------------------------------
const appointmentSchema = new Schema(
  {
    profileId: { type: ObjectId, ref: "Profile", required: true },
    doctorName: { type: String, required: true, trim: true, maxlength: 100 },
    specialty: { type: String, default: "", trim: true, maxlength: 80 },
    location: { type: String, default: "", trim: true, maxlength: 200 },
    dateTime: { type: Date, required: true },
    notes: { type: String, default: "", trim: true, maxlength: 1000 },
    status: { type: String, enum: APPOINTMENT_STATUSES, default: "scheduled" },
    /** The member responsible for this visit (e.g. who takes the elder there). */
    assigneeId: { type: ObjectId, ref: "User", default: null },
    statusChangedAt: { type: Date, default: null },
    statusChangedByName: { type: String, default: null },
    createdBy: { type: ObjectId, ref: "User", default: null },
    updatedBy: { type: ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);
appointmentSchema.index({ profileId: 1, dateTime: 1 });
appointmentSchema.index({ status: 1, dateTime: 1 });
export const Appointment = defineModel("Appointment", appointmentSchema);

// ---------------------------------------------------------------------------
// Activity: audit trail, so the elder can always see who changed what.
// ---------------------------------------------------------------------------
const activitySchema = new Schema(
  {
    profileId: { type: ObjectId, ref: "Profile", required: true },
    /** Who did it; null for Saathi's own automatic actions (reminders, escalations). */
    actorId: { type: ObjectId, ref: "User", default: null },
    actorName: { type: String, required: true },
    kind: { type: String, enum: ACTIVITY_KINDS, required: true },
    message: { type: String, required: true, maxlength: 300 },
    /** The status of the dose, alert or task right after this event (e.g. "pending", "acknowledged"). */
    status: { type: String, default: null },
    /** The alert, medicine or appointment the event is about. */
    refId: { type: String, default: null },
    /** Everyone involved (who acted, was notified or was assigned), for the timeline's member filter. */
    involvedUserIds: { type: [ObjectId], default: [] },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
activitySchema.index({ profileId: 1, createdAt: -1 });
export const Activity = defineModel("Activity", activitySchema);

// ---------------------------------------------------------------------------
// Alert: one escalated time slot (all medicines due at the same time), from the first reminder to
// the moment someone confirmed what happened. The unique index makes escalation happen only once.
// ---------------------------------------------------------------------------
const alertSchema = new Schema(
  {
    profileId: { type: ObjectId, ref: "Profile", required: true },
    /** When the medicines were due. */
    slot: { type: Date, required: true },
    localDate: { type: String, required: true },
    localTime: { type: String, required: true },
    medicationIds: { type: [ObjectId], default: [] },
    /** Medicine labels at the time of the alert (kept even if a medicine is renamed later). */
    medicines: { type: [String], default: [] },
    status: { type: String, enum: ALERT_STATUSES, default: "open" },
    reminderSentAt: { type: Date, default: null },
    followUpSentAt: { type: Date, default: null },
    escalatedAt: { type: Date, required: true },
    notifiedUserIds: { type: [ObjectId], default: [] },
    notifiedNames: { type: [String], default: [] },
    /** Set when nobody acknowledged in time and the rest of the circle was alerted too. */
    widenedAt: { type: Date, default: null },
    widenedNames: { type: [String], default: [] },
    acknowledgedAt: { type: Date, default: null },
    acknowledgedById: { type: ObjectId, ref: "User", default: null },
    acknowledgedByName: { type: String, default: null },
    resolvedAt: { type: Date, default: null },
    resolvedByName: { type: String, default: null },
    /** What was finally recorded: "taken", "skipped", "missed" or "mixed". */
    resolution: { type: String, default: null },
  },
  { timestamps: true },
);
alertSchema.index({ profileId: 1, slot: 1 }, { unique: true });
alertSchema.index({ profileId: 1, escalatedAt: -1 });
alertSchema.index({ status: 1, escalatedAt: 1 });
export const Alert = defineModel("Alert", alertSchema);

// ---------------------------------------------------------------------------
// ReminderLog: guarantees each reminder email is sent at most once.
// ---------------------------------------------------------------------------
const reminderLogSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    profileId: { type: ObjectId, ref: "Profile", required: true },
    kind: { type: String, required: true },
    recipients: { type: [String], default: [] },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
reminderLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });
export const ReminderLog = defineModel("ReminderLog", reminderLogSchema);

// ---------------------------------------------------------------------------
// RateLimit: fixed-window counters for login and passcode attempts.
// ---------------------------------------------------------------------------
const rateLimitSchema = new Schema({
  key: { type: String, required: true, unique: true },
  count: { type: Number, required: true },
  expiresAt: { type: Date, required: true },
});
rateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const RateLimit = defineModel("RateLimit", rateLimitSchema);
