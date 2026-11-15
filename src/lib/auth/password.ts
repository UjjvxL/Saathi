import "server-only";
import { createHash } from "node:crypto";
import { compare, hash } from "bcryptjs";

/**
 * Short fingerprint of a password hash. Put into password-reset links so a link stops
 * working as soon as the password changes (making each link single-use).
 */
export function passwordFingerprint(passwordHash: string): string {
  return createHash("sha256").update(passwordHash).digest("base64url").slice(0, 16);
}

// 12 rounds in production; tests lower it via BCRYPT_ROUNDS to stay fast.
const ROUNDS = Math.min(14, Math.max(4, Number(process.env.BCRYPT_ROUNDS) || 12));

/** Hashes a password or passcode. Plain-text secrets are never stored. */
export function hashSecret(plain: string): Promise<string> {
  return hash(plain, ROUNDS);
}

export function verifySecret(plain: string, hashed: string): Promise<boolean> {
  return compare(plain, hashed);
}

let dummyHash: Promise<string> | null = null;

/** Spends the same time as a real check, so response timing doesn't reveal which emails exist. */
export async function burnVerifyTime(plain: string): Promise<void> {
  dummyHash ??= hash("timing-equalizer-not-a-real-password", ROUNDS);
  await compare(plain, await dummyHash);
}
