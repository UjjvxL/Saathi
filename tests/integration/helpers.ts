// Factories and helpers shared by the integration tests.
import type { Types } from "mongoose";
import { expect } from "vitest";
import { signSession } from "@/lib/auth/jwt";
import { hashSecret } from "@/lib/auth/password";
import { SESSION_COOKIE, type Role } from "@/lib/constants";
import { connectDB } from "@/lib/db";
import { Medication, Membership, Profile, User } from "@/lib/models";
import { RedirectSignal, testState } from "../setup/integration";

let sequence = 0;
const unique = () => `${Date.now().toString(36)}${(++sequence).toString(36)}`;

export const PASSWORD = "correct-horse-battery";

export async function createUser(name = "Test User", overrides: { email?: string; password?: string } = {}) {
  await connectDB();
  return User.create({
    name,
    email: overrides.email ?? `${name.toLowerCase().replace(/\W+/g, ".")}.${unique()}@example.com`,
    passwordHash: await hashSecret(overrides.password ?? PASSWORD),
  });
}

type UserDoc = Awaited<ReturnType<typeof createUser>>;

/** Puts a valid session cookie for `user` into the mocked cookie jar. */
export async function signInAs(user: UserDoc) {
  const token = await signSession({ userId: user._id.toString(), name: user.name, version: user.sessionVersion ?? 0 });
  testState.cookies.set(SESSION_COOKIE, token);
}

export function signOut() {
  testState.cookies.clear();
}

export function formData(fields: Record<string, string | number | string[] | undefined>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) data.append(key, String(item));
  }
  return data;
}

/** Creates a care profile directly in the database with `owner` as its admin. */
export async function createCircle(
  owner: UserDoc,
  options: { role?: Role; name?: string; timezone?: string; elderEmail?: string | null; passcode?: string } = {},
) {
  await connectDB();
  const passcode = options.passcode ?? "246810";
  const profile = await Profile.create({
    name: options.name ?? "Kamala Devi",
    elderEmail: options.elderEmail === undefined ? `elder.${unique()}@example.com` : options.elderEmail,
    timezone: options.timezone ?? "Asia/Kolkata",
    careId: unique().slice(-6).toUpperCase().padEnd(6, "X"),
    passcodeHash: await hashSecret(passcode),
    passcodeUpdatedAt: new Date(),
    createdBy: owner._id,
  });
  await Membership.create({ profileId: profile._id, userId: owner._id, role: options.role ?? "family", isAdmin: true });
  return { profile, profileId: profile._id.toString(), passcode };
}

export async function addMember(profileId: string, user: UserDoc, role: Role, options: { isAdmin?: boolean; emailAlerts?: boolean } = {}) {
  return Membership.create({
    profileId,
    userId: user._id,
    role,
    isAdmin: options.isAdmin ?? role === "elder",
    emailAlerts: options.emailAlerts ?? true,
  });
}

export async function createMedication(
  profileId: string,
  overrides: Partial<{
    name: string;
    dosage: string;
    times: string[];
    frequency: "daily" | "specific_days";
    daysOfWeek: number[];
    startDate: string;
    endDate: string | null;
    stock: number | null;
    unitsPerDose: number;
    refillThreshold: number | null;
    active: boolean;
    scheduleChangedAt: Date;
    instructions: string;
    assigneeId: Types.ObjectId | null;
  }> = {},
) {
  return Medication.create({
    profileId,
    name: "Metformin",
    dosage: "500 mg",
    form: "tablet",
    instructions: "After food",
    times: ["08:00", "20:00"],
    frequency: "daily",
    daysOfWeek: [],
    startDate: "2020-01-01",
    endDate: null,
    stock: null,
    unitsPerDose: 1,
    refillThreshold: null,
    active: true,
    scheduleChangedAt: new Date("2020-01-01T00:00:00Z"),
    ...overrides,
  });
}

/** Runs an action that should end in a Next.js redirect and returns the target. */
export async function expectRedirect(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    if (error instanceof RedirectSignal) return error.location;
    throw error;
  }
  expect.fail("Expected a redirect");
}

export function emailsTo(address: string) {
  return testState.outbox.filter((email) => email.to === address);
}
