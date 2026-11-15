import { describe, expect, it } from "vitest";
import {
  createProfile,
  joinProfile,
  leaveCircle,
  regeneratePasscode,
  removeMember,
  setAdmin,
  setEmailAlerts,
  updateProfile,
  updateReminderSettings,
} from "@/app/actions/profiles";
import { verifySecret } from "@/lib/auth/password";
import { Activity, Medication, Membership, Profile } from "@/lib/models";
import { testState } from "../setup/integration";
import { addMember, createCircle, createMedication, createUser, expectRedirect, formData, signInAs, signOut } from "./helpers";

const profileFields = {
  name: "Kamala Devi",
  relationship: "family",
  elderEmail: "kamala@example.com",
  dateOfBirth: "1950-05-01",
  timezone: "Asia/Kolkata",
  conditions: "Diabetes, High BP",
  allergies: "Penicillin",
  emergencyContactName: "Dr. Shah",
  emergencyContactPhone: "+91 98765 43210",
};

describe("createProfile", () => {
  it("sends signed-out visitors to log in", async () => {
    signOut();
    expect(await expectRedirect(() => createProfile({}, formData(profileFields)))).toBe("/login");
  });

  it("validates the details", async () => {
    await signInAs(await createUser("Rahul"));
    const state = await createProfile({}, formData({ ...profileFields, name: "", timezone: "Mars/Base" }));
    expect(state.errors?.name).toBeTruthy();
    expect(state.errors?.timezone).toEqual(["Pick a valid timezone"]);
  });

  it("creates the profile with a Care ID and a one-time passcode, and makes the creator admin", async () => {
    const rahul = await createUser("Rahul");
    await signInAs(rahul);
    const state = await createProfile({}, formData(profileFields));

    expect(state.ok).toBe(true);
    expect(state.careId).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(state.passcode).toMatch(/^\d{6}$/);

    const profile = await Profile.findById(state.profileId).lean();
    expect(profile?.conditions).toEqual(["Diabetes", "High BP"]);
    expect(profile?.passcodeHash).not.toContain(state.passcode);
    expect(await verifySecret(state.passcode ?? "", profile?.passcodeHash ?? "")).toBe(true);

    const membership = await Membership.findOne({ profileId: state.profileId, userId: rahul._id }).lean();
    expect(membership).toMatchObject({ role: "family", isAdmin: true, emailAlerts: true });
    expect(await Activity.countDocuments({ profileId: state.profileId })).toBe(1);
  });
});

describe("joinProfile", () => {
  async function setup() {
    const owner = await createUser("Rahul Sharma");
    const circle = await createCircle(owner, { passcode: "135790" });
    const joiner = await createUser("Priya Nair");
    await signInAs(joiner);
    return { owner, joiner, ...circle };
  }

  it("rejects a wrong passcode without saying which part was wrong", async () => {
    const { profile } = await setup();
    const state = await joinProfile({}, formData({ careId: profile.careId, passcode: "000000", relationship: "caretaker" }));
    expect(state.message).toMatch(/don’t match/);
    expect(await Membership.countDocuments({ profileId: profile._id })).toBe(1);
  });

  it("joins with a loosely typed Care ID, logs it and emails the admins", async () => {
    const { profile, owner, joiner } = await setup();
    const loose = ` ${profile.careId.slice(0, 3).toLowerCase()}-${profile.careId.slice(3).toLowerCase()} `;
    const target = await expectRedirect(() => joinProfile({}, formData({ careId: loose, passcode: "135790", relationship: "caretaker" })));

    expect(target).toBe(`/p/${profile._id.toString()}`);
    expect(await Membership.findOne({ profileId: profile._id, userId: joiner._id }).lean()).toMatchObject({
      role: "caretaker",
      isAdmin: false,
    });
    const recipients = testState.outbox.map((email) => email.to);
    expect(recipients).toContain(owner.email);
    expect(recipients).toContain(profile.elderEmail);
    expect(testState.outbox[0].subject).toBe("Priya Nair joined Kamala Devi’s care circle");
    expect(await Activity.findOne({ profileId: profile._id, kind: "member" }).lean()).toMatchObject({
      message: "Priya Nair joined as caretaker",
    });
  });

  it("only allows one elder account per profile", async () => {
    const { profile } = await setup();
    await addMember(profile._id.toString(), await createUser("Kamala"), "elder");
    const state = await joinProfile({}, formData({ careId: profile.careId, passcode: "135790", relationship: "elder" }));
    expect(state.errors?.relationship?.[0]).toMatch(/already has an elder/);
  });

  it("locks a Care ID after repeated wrong passcodes, even for the right one", async () => {
    const { profile } = await setup();
    for (let i = 0; i < 5; i++) {
      await joinProfile({}, formData({ careId: profile.careId, passcode: String(100000 + i), relationship: "family" }));
    }
    const state = await joinProfile({}, formData({ careId: profile.careId, passcode: "135790", relationship: "family" }));
    expect(state.message).toMatch(/Too many attempts/);
  });
});

describe("passcode, members and admins", () => {
  async function circleWithMembers() {
    const owner = await createUser("Rahul Sharma");
    const { profile, profileId } = await createCircle(owner, { passcode: "135790" });
    const caretaker = await createUser("Priya Nair");
    const elder = await createUser("Kamala Devi");
    const caretakerMembership = await addMember(profileId, caretaker, "caretaker");
    const elderMembership = await addMember(profileId, elder, "elder");
    const ownerMembership = await Membership.findOne({ profileId, userId: owner._id });
    return { owner, caretaker, elder, profile, profileId, caretakerMembership, elderMembership, ownerMembership };
  }

  it("lets only admins generate a new passcode, and the old one stops working", async () => {
    const { owner, caretaker, profile, profileId } = await circleWithMembers();

    await signInAs(caretaker);
    expect((await regeneratePasscode(profileId, {}, formData({}))).message).toMatch(/Only care-circle admins/);

    await signInAs(owner);
    const state = await regeneratePasscode(profileId, {}, formData({}));
    expect(state.passcode).toMatch(/^\d{6}$/);
    expect(state.passcode).not.toBe("135790");

    await signInAs(await createUser("Newcomer"));
    const oldCode = await joinProfile({}, formData({ careId: profile.careId, passcode: "135790", relationship: "family" }));
    expect(oldCode.message).toMatch(/don’t match/);
    expect(
      await expectRedirect(() => joinProfile({}, formData({ careId: profile.careId, passcode: state.passcode ?? "", relationship: "family" }))),
    ).toBe(`/p/${profileId}`);
  });

  it("keeps the elder in control of their own account", async () => {
    const { owner, elder, profileId, elderMembership, caretakerMembership } = await circleWithMembers();

    await signInAs(owner);
    const attempt = await removeMember(profileId, elderMembership._id.toString(), {}, formData({}));
    expect(attempt.message).toMatch(/Only the elder can remove/);
    expect((await setAdmin(profileId, elderMembership._id.toString(), false, {}, formData({}))).message).toMatch(
      /always stays an admin/,
    );

    await signInAs(elder);
    expect((await removeMember(profileId, caretakerMembership._id.toString(), {}, formData({}))).ok).toBe(true);
    expect(await Membership.exists({ _id: caretakerMembership._id })).toBeNull();
  });

  it("doesn't let non-admins manage members, and nobody removes themselves by mistake", async () => {
    const { owner, caretaker, profileId, ownerMembership } = await circleWithMembers();
    await signInAs(caretaker);
    expect((await removeMember(profileId, ownerMembership!._id.toString(), {}, formData({}))).message).toMatch(
      /Only care-circle admins/,
    );
    await signInAs(owner);
    expect((await removeMember(profileId, ownerMembership!._id.toString(), {}, formData({}))).message).toMatch(
      /Leave this care circle/,
    );
  });

  it("promotes members and never leaves a circle without an admin", async () => {
    const { owner, profileId, caretakerMembership, ownerMembership } = await circleWithMembers();
    await signInAs(owner);
    await setAdmin(profileId, caretakerMembership._id.toString(), true, {}, formData({}));
    expect((await Membership.findById(caretakerMembership._id).lean())?.isAdmin).toBe(true);

    // Demote everyone but one admin: the elder stays admin regardless.
    await setAdmin(profileId, caretakerMembership._id.toString(), false, {}, formData({}));
    await Membership.updateOne({ _id: ownerMembership!._id }, { $set: { isAdmin: true } });
    await Membership.updateMany({ profileId, role: "elder" }, { $set: { isAdmin: false } });
    const last = await setAdmin(profileId, ownerMembership!._id.toString(), false, {}, formData({}));
    expect(last.message).toMatch(/at least one admin/);
  });
});

describe("leaving a circle", () => {
  it("blocks the only admin from leaving others behind", async () => {
    const owner = await createUser("Rahul");
    const { profileId } = await createCircle(owner);
    await addMember(profileId, await createUser("Priya"), "family");
    await signInAs(owner);
    expect((await leaveCircle(profileId, {}, formData({}))).message).toMatch(/only admin/);
  });

  it("lets members leave, and deletes everything when the last member goes", async () => {
    const owner = await createUser("Rahul");
    const { profileId } = await createCircle(owner);
    const priya = await createUser("Priya");
    await addMember(profileId, priya, "family");
    await createMedication(profileId);

    await signInAs(priya);
    expect(await expectRedirect(() => leaveCircle(profileId, {}, formData({})))).toBe("/dashboard");
    expect(await Profile.exists({ _id: profileId })).not.toBeNull();

    await signInAs(owner);
    expect(await expectRedirect(() => leaveCircle(profileId, {}, formData({})))).toBe("/dashboard");
    expect(await Profile.exists({ _id: profileId })).toBeNull();
    expect(await Medication.countDocuments({ profileId })).toBe(0);
  });
});

describe("settings", () => {
  it("validates reminder timing and restricts it to admins", async () => {
    const owner = await createUser("Rahul");
    const { profileId } = await createCircle(owner);
    const member = await createUser("Priya");
    await addMember(profileId, member, "family");

    await signInAs(member);
    expect(
      (await updateReminderSettings(profileId, {}, formData({ followUpAfterMinutes: 15, escalateAfterMinutes: 30 }))).message,
    ).toMatch(/Only care-circle admins/);

    await signInAs(owner);
    const invalid = await updateReminderSettings(profileId, {}, formData({ followUpAfterMinutes: 60, escalateAfterMinutes: 45 }));
    expect(invalid.errors?.escalateAfterMinutes).toBeTruthy();
    expect((await updateReminderSettings(profileId, {}, formData({ followUpAfterMinutes: 45, escalateAfterMinutes: 120 }))).ok).toBe(true);
    expect(await Profile.findById(profileId).lean()).toMatchObject({ followUpAfterMinutes: 45, escalateAfterMinutes: 120 });
  });

  it("updates profile details (admins only) and email alert preferences (anyone)", async () => {
    const owner = await createUser("Rahul");
    const { profileId } = await createCircle(owner);
    const member = await createUser("Priya");
    await addMember(profileId, member, "family");

    await signInAs(member);
    expect((await updateProfile(profileId, {}, formData({ ...profileFields, name: "Kamala D." }))).message).toMatch(/Only/);
    expect((await setEmailAlerts(profileId, false, {}, formData({}))).ok).toBe(true);
    expect((await Membership.findOne({ profileId, userId: member._id }).lean())?.emailAlerts).toBe(false);

    await signInAs(owner);
    expect((await updateProfile(profileId, {}, formData({ ...profileFields, name: "Kamala D." }))).ok).toBe(true);
    expect((await Profile.findById(profileId).lean())?.name).toBe("Kamala D.");
  });

  it("hides other families' profiles completely", async () => {
    const { profileId } = await createCircle(await createUser("Rahul"));
    await signInAs(await createUser("Stranger"));
    expect((await setEmailAlerts(profileId, false, {}, formData({}))).message).toMatch(/don’t have access/);
    expect((await regeneratePasscode(profileId, {}, formData({}))).message).toMatch(/don’t have access/);
  });
});
