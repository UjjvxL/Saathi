import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  process.env.AUTH_SECRET = "unit-test-secret-that-is-at-least-32-chars";
});

afterEach(() => {
  vi.useRealTimers();
});

describe("session tokens", () => {
  it("round-trip the user, name and session version", async () => {
    const { signSession, verifySession } = await import("@/lib/auth/jwt");
    const token = await signSession({ userId: "u1", name: "Rahul", version: 3 });
    expect(await verifySession(token)).toEqual({ userId: "u1", name: "Rahul", version: 3 });
  });

  it("expire after a week", async () => {
    const { signSession, verifySession } = await import("@/lib/auth/jwt");
    const token = await signSession({ userId: "u1", name: "Rahul", version: 0 });
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 8 * 24 * 60 * 60 * 1000);
    expect(await verifySession(token)).toBeNull();
  });

  it("can't be swapped with single-purpose tokens", async () => {
    const { signPurposeToken, signSession, verifyPurposeToken, verifySession } = await import("@/lib/auth/jwt");
    const confirmLink = await signPurposeToken("confirm-dose", { sub: "u1", profileId: "p1" }, "12h");
    expect(await verifySession(confirmLink)).toBeNull();

    const session = await signSession({ userId: "u1", name: "Rahul", version: 0 });
    expect(await verifyPurposeToken(session, "confirm-dose")).toBeNull();
    expect(await verifyPurposeToken(confirmLink, "reset-password")).toBeNull();
    expect(await verifyPurposeToken(confirmLink, "confirm-dose")).toMatchObject({ profileId: "p1" });
  });

  it("ignore garbage", async () => {
    const { verifySession } = await import("@/lib/auth/jwt");
    expect(await verifySession(undefined)).toBeNull();
    expect(await verifySession("not-a-jwt")).toBeNull();
  });

  it("refuse to work with a weak secret", async () => {
    vi.resetModules();
    process.env.AUTH_SECRET = "too-short";
    const { signSession } = await import("@/lib/auth/jwt");
    await expect(signSession({ userId: "u1", name: "Rahul", version: 0 })).rejects.toThrow(/AUTH_SECRET/);
    process.env.AUTH_SECRET = "unit-test-secret-that-is-at-least-32-chars";
    vi.resetModules();
  });
});

describe("password helpers", () => {
  it("hash, verify and fingerprint secrets", async () => {
    process.env.BCRYPT_ROUNDS = "4";
    const { hashSecret, passwordFingerprint, verifySecret } = await import("@/lib/auth/password");
    const hash = await hashSecret("123456");
    expect(hash).not.toContain("123456");
    expect(await verifySecret("123456", hash)).toBe(true);
    expect(await verifySecret("654321", hash)).toBe(false);
    expect(passwordFingerprint(hash)).toHaveLength(16);
    expect(passwordFingerprint(hash)).not.toBe(passwordFingerprint(await hashSecret("123456")));
  });
});
