import "server-only";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models";
import { signPurposeToken, verifyPurposeToken } from "./jwt";
import { passwordFingerprint } from "./password";

const RESET_PASSWORD_PURPOSE = "reset-password";
const RESET_LINK_TTL = "30m";

/** A signed, 30-minute reset token bound to the current password (so it's single-use). */
export function createResetToken(user: { _id: { toString(): string }; passwordHash: string }): Promise<string> {
  return signPurposeToken(
    RESET_PASSWORD_PURPOSE,
    { sub: user._id.toString(), fp: passwordFingerprint(user.passwordHash) },
    RESET_LINK_TTL,
  );
}

/** The user a reset link belongs to, or null if it is invalid, expired or already used. */
export async function findResetUser(token: string) {
  const claims = await verifyPurposeToken(token, RESET_PASSWORD_PURPOSE);
  if (!claims || typeof claims.sub !== "string" || typeof claims.fp !== "string") return null;
  if (!mongoose.isValidObjectId(claims.sub)) return null;
  await connectDB();
  const user = await User.findById(claims.sub).select("name email passwordHash sessionVersion").lean();
  if (!user || passwordFingerprint(user.passwordHash) !== claims.fp) return null;
  return user;
}
