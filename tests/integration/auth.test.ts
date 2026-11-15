import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { login, requestPasswordReset, resetPassword, signup } from "@/app/actions/auth";
import { GET as expiredRoute } from "@/app/api/auth/expired/route";
import { POST as logoutRoute } from "@/app/api/auth/logout/route";
import { getCurrentUser } from "@/lib/auth/dal";
import { SESSION_COOKIE } from "@/lib/constants";
import { User } from "@/lib/models";
import { testState } from "../setup/integration";
import { createUser, expectRedirect, formData, PASSWORD, signInAs } from "./helpers";

describe("signup", () => {
  it("rejects invalid input with field errors and keeps what was typed", async () => {
    const state = await signup({}, formData({ name: "A", email: "not-an-email", password: "short" }));
    expect(state.errors?.name).toBeTruthy();
    expect(state.errors?.email).toEqual(["Enter a valid email address"]);
    expect(state.errors?.password).toEqual(["Use at least 8 characters"]);
    expect(state.values).toEqual({ name: "A", email: "not-an-email" });
    expect(state.values).not.toHaveProperty("password");
  });

  it("creates the account, signs the user in and redirects", async () => {
    const target = await expectRedirect(() =>
      signup({}, formData({ name: "Asha Rao", email: "Asha@Example.com", password: "a-good-password", next: "/join" })),
    );
    expect(target).toBe("/join");
    const user = await User.findOne({ email: "asha@example.com" }).lean();
    expect(user?.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(user?.passwordHash).not.toContain("a-good-password");
    expect(testState.cookies.get(SESSION_COOKIE)).toBeTruthy();
    expect((await getCurrentUser())?.email).toBe("asha@example.com");
  });

  it("never redirects to another site", async () => {
    const target = await expectRedirect(() =>
      signup({}, formData({ name: "Evil Test", email: "evil@example.com", password: "a-good-password", next: "//evil.example" })),
    );
    expect(target).toBe("/dashboard");
  });

  it("refuses a second account with the same email", async () => {
    await createUser("Existing", { email: "taken@example.com" });
    const state = await signup({}, formData({ name: "Someone", email: "taken@example.com", password: "a-good-password" }));
    expect(state.errors?.email?.[0]).toMatch(/already exists/);
  });
});

describe("login", () => {
  it("signs in with the right password", async () => {
    const user = await createUser("Rahul", { email: "rahul@example.com" });
    const target = await expectRedirect(() => login({}, formData({ email: "RAHUL@example.com", password: PASSWORD })));
    expect(target).toBe("/dashboard");
    expect((await getCurrentUser())?.id).toBe(user._id.toString());
  });

  it("gives the same answer for a wrong password and an unknown email", async () => {
    await createUser("Rahul", { email: "rahul@example.com" });
    const wrongPassword = await login({}, formData({ email: "rahul@example.com", password: "nope-nope" }));
    const unknownEmail = await login({}, formData({ email: "nobody@example.com", password: "nope-nope" }));
    expect(wrongPassword.message).toBe("Email or password is incorrect.");
    expect(unknownEmail.message).toBe(wrongPassword.message);
    expect(testState.cookies.has(SESSION_COOKIE)).toBe(false);
  });

  it("locks the account after repeated wrong passwords", async () => {
    await createUser("Rahul", { email: "rahul@example.com" });
    for (let i = 0; i < 8; i++) await login({}, formData({ email: "rahul@example.com", password: "wrong-password" }));
    const blocked = await login({}, formData({ email: "rahul@example.com", password: PASSWORD }));
    expect(blocked.message).toMatch(/Too many attempts/);
    expect(testState.cookies.has(SESSION_COOKIE)).toBe(false);
  });

  it("logs out with a full page load that clears the session cookie", async () => {
    const response = await logoutRoute(
      new Request("https://saathi.test/api/auth/logout", {
        method: "POST",
        headers: { origin: "https://saathi.test", "x-forwarded-host": "saathi.test" },
      }),
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/login");
    expect(response.headers.get("set-cookie")).toMatch(/^saathi_session=; Path=\/; Max-Age=0; HttpOnly; SameSite=Lax/);
  });

  it("ignores logout requests from other websites", async () => {
    const response = await logoutRoute(
      new Request("https://saathi.test/api/auth/logout", {
        method: "POST",
        headers: { origin: "https://evil.example", "x-forwarded-host": "saathi.test" },
      }),
    );
    expect(response.status).toBe(403);
  });
});

describe("sessions", () => {
  it("rejects a tampered session cookie", async () => {
    const user = await createUser("Rahul");
    await signInAs(user);
    const token = testState.cookies.get(SESSION_COOKIE) ?? "";
    testState.cookies.set(SESSION_COOKIE, `${token.slice(0, -4)}abcd`);
    expect(await getCurrentUser()).toBeNull();
  });

  it("rejects a cookie signed with another secret", async () => {
    const user = await createUser("Rahul");
    const forged = await new SignJWT({ name: user.name, sv: 0 })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(user._id.toString())
      .setAudience("session")
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("a-completely-different-secret-value-123"));
    testState.cookies.set(SESSION_COOKIE, forged);
    expect(await getCurrentUser()).toBeNull();
  });

  it("ends the session when the account is deleted", async () => {
    const user = await createUser("Rahul");
    await signInAs(user);
    await User.deleteOne({ _id: user._id });
    expect(await getCurrentUser()).toBeNull();
  });

  it("clears a stale session cookie so the person can log in or sign up again", async () => {
    const user = await createUser("Rahul");
    await signInAs(user);
    await User.deleteOne({ _id: user._id }); // e.g. the app moved to a new database

    const response = await expiredRoute();
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/login?expired=1");
    expect(response.headers.get("set-cookie")).toMatch(/^saathi_session=; Path=\/; Max-Age=0/);
  });

  it("never clears a valid session", async () => {
    await signInAs(await createUser("Rahul"));
    const response = await expiredRoute();
    expect(response.headers.get("location")).toBe("/dashboard");
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});

describe("password reset", () => {
  function resetLink(): string {
    const email = testState.outbox.at(-1);
    const match = email?.text.match(/reset-password\?token=([^\s]+)/);
    if (!match) throw new Error("no reset link sent");
    return decodeURIComponent(match[1]);
  }

  it("answers the same way whether or not the email has an account", async () => {
    const unknown = await requestPasswordReset({}, formData({ email: "nobody@example.com" }));
    expect(unknown.ok).toBe(true);
    expect(testState.outbox).toHaveLength(0);

    await createUser("Rahul", { email: "rahul@example.com" });
    const known = await requestPasswordReset({}, formData({ email: "rahul@example.com" }));
    expect(known).toEqual(unknown);
    expect(testState.outbox).toHaveLength(1);
    expect(testState.outbox[0].subject).toMatch(/Reset your Saathi password/);
  });

  it("sets a new password once, signs the user in and signs out other devices", async () => {
    const user = await createUser("Rahul", { email: "rahul@example.com" });
    await signInAs(user);
    const oldSession = testState.cookies.get(SESSION_COOKIE);

    await requestPasswordReset({}, formData({ email: "rahul@example.com" }));
    const token = resetLink();

    const mismatch = await resetPassword(token, {}, formData({ password: "new-password-1", confirmPassword: "different" }));
    expect(mismatch.errors?.confirmPassword?.[0]).toMatch(/don’t match/);

    expect(
      await expectRedirect(() => resetPassword(token, {}, formData({ password: "new-password-1", confirmPassword: "new-password-1" }))),
    ).toBe("/dashboard");
    expect((await getCurrentUser())?.id).toBe(user._id.toString());

    // The old cookie (another device) no longer works.
    testState.cookies.set(SESSION_COOKIE, oldSession ?? "");
    expect(await getCurrentUser()).toBeNull();

    // The link is single-use.
    const again = await resetPassword(token, {}, formData({ password: "new-password-2", confirmPassword: "new-password-2" }));
    expect(again.message).toMatch(/expired or was already used/);

    // And the new password works.
    expect(await expectRedirect(() => login({}, formData({ email: "rahul@example.com", password: "new-password-1" })))).toBe(
      "/dashboard",
    );
  });

  it("rejects forged tokens", async () => {
    const state = await resetPassword("not.a.token", {}, formData({ password: "new-password-1", confirmPassword: "new-password-1" }));
    expect(state.message).toMatch(/expired or was already used/);
  });
});
