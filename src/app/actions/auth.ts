"use server";

import { redirect } from "next/navigation";
import { burnVerifyTime, hashSecret, verifySecret } from "@/lib/auth/password";
import { createResetToken, findResetUser } from "@/lib/auth/reset";
import { createSession } from "@/lib/auth/session";
import { connectDB, isDuplicateKeyError } from "@/lib/db";
import { sendEmail } from "@/lib/email/mailer";
import { passwordResetEmail } from "@/lib/email/templates";
import { env } from "@/lib/env";
import { User } from "@/lib/models";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { safeRedirectPath } from "@/lib/security";
import {
  fieldErrors,
  forgotPasswordSchema,
  loginSchema,
  readForm,
  resetPasswordSchema,
  signupSchema,
  type FormState,
} from "@/lib/validation";

export async function signup(_prev: FormState, formData: FormData): Promise<FormState> {
  const raw = readForm(formData, ["name", "email", "password"] as const);
  const values = { name: raw.name, email: raw.email };
  const parsed = signupSchema.safeParse(raw);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  const limit = await rateLimit(`signup-ip:${await clientIp()}`, 10, 60 * 60);
  if (!limit.allowed) return { message: "Too many new accounts from this network. Please try again later.", values };

  await connectDB();
  try {
    const user = await User.create({
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash: await hashSecret(parsed.data.password),
    });
    await createSession({ userId: user._id.toString(), name: user.name, version: 0 });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return { errors: { email: ["An account with this email already exists. Try logging in."] }, values };
    }
    throw error;
  }
  redirect(safeRedirectPath(formData.get("next")));
}

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const raw = readForm(formData, ["email", "password"] as const);
  const values = { email: raw.email };
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  const { email, password } = parsed.data;

  // Limit guesses per account and per network.
  const [byEmail, byIp] = await Promise.all([
    rateLimit(`login:${email}`, 8, 15 * 60),
    rateLimit(`login-ip:${await clientIp()}`, 40, 15 * 60),
  ]);
  if (!byEmail.allowed || !byIp.allowed) {
    const minutes = Math.ceil(Math.max(byEmail.retryAfterSeconds, byIp.retryAfterSeconds) / 60);
    return { message: `Too many attempts. Please wait ${minutes} minute${minutes === 1 ? "" : "s"} and try again.`, values };
  }

  await connectDB();
  const user = await User.findOne({ email }).select("name passwordHash sessionVersion").lean();
  let valid = false;
  if (user) valid = await verifySecret(password, user.passwordHash);
  else await burnVerifyTime(password);
  if (!user || !valid) return { message: "Email or password is incorrect.", values };

  await createSession({ userId: user._id.toString(), name: user.name, version: user.sessionVersion ?? 0 });
  redirect(safeRedirectPath(formData.get("next")));
}

/** Emails a 30-minute reset link. Always answers the same way, so it never reveals which emails have accounts. */
export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const raw = readForm(formData, ["email"] as const);
  const parsed = forgotPasswordSchema.safeParse(raw);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: raw };
  const { email } = parsed.data;
  const done: FormState = {
    ok: true,
    message: "If an account exists for that email, we’ve sent a link to reset the password. It works for 30 minutes.",
  };

  const [byEmail, byIp] = await Promise.all([
    rateLimit(`reset:${email}`, 3, 60 * 60),
    rateLimit(`reset-ip:${await clientIp()}`, 10, 60 * 60),
  ]);
  if (!byEmail.allowed || !byIp.allowed) return done;

  await connectDB();
  const user = await User.findOne({ email }).select("name email passwordHash").lean();
  if (!user) return done;

  const token = await createResetToken(user);
  try {
    await sendEmail(
      user.email,
      passwordResetEmail({
        name: user.name,
        resetUrl: `${env.appUrl()}/reset-password?token=${encodeURIComponent(token)}`,
      }),
    );
  } catch (error) {
    console.error("[password-reset] email failed", error);
  }
  return done;
}

export async function resetPassword(token: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const raw = readForm(formData, ["password", "confirmPassword"] as const);
  const parsed = resetPasswordSchema.safeParse(raw);
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const user = await findResetUser(token);
  if (!user) return { message: "This reset link has expired or was already used. Please request a new one." };

  // Changing the hash also invalidates this link; bumping the version signs out every other device.
  const updated = await User.findOneAndUpdate(
    { _id: user._id, passwordHash: user.passwordHash },
    { $set: { passwordHash: await hashSecret(parsed.data.password) }, $inc: { sessionVersion: 1 } },
    { returnDocument: "after" },
  ).lean();
  if (!updated) return { message: "This reset link has expired or was already used. Please request a new one." };

  await createSession({ userId: updated._id.toString(), name: updated.name, version: updated.sessionVersion ?? 0 });
  redirect("/dashboard");
}
