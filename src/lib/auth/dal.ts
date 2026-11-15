// Data Access Layer: the single place that turns a session cookie into a user and
// checks care-circle membership. Every page, server action and route handler goes through here.
import "server-only";
import mongoose from "mongoose";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { connectDB } from "@/lib/db";
import { toMembershipDTO, toProfileDTO } from "@/lib/dto";
import { Membership, Profile, User } from "@/lib/models";
import type { CurrentUser, MemberContext } from "@/lib/types";
import { getSession } from "./session";

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await getSession();
  if (!session || !mongoose.isValidObjectId(session.userId)) return null;
  await connectDB();
  const user = await User.findById(session.userId).select("name email sessionVersion").lean();
  // A password reset bumps sessionVersion, which signs out sessions issued before it.
  if (!user || (user.sessionVersion ?? 0) !== session.version) return null;
  return { id: user._id.toString(), name: user.name, email: user.email };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  // The cookie may still be correctly signed but belong to a deleted account, an old database or a
  // session ended by a password reset. That route clears it, then sends the person to log in.
  if (!user) redirect("/api/auth/expired");
  return user;
}

/** The current user's view of a profile, or null if they aren't signed in or aren't in its care circle. */
export async function findMemberContext(profileId: string): Promise<MemberContext | null> {
  const user = await getCurrentUser();
  if (!user || !mongoose.isValidObjectId(profileId)) return null;
  await connectDB();
  const [profile, membership] = await Promise.all([
    Profile.findById(profileId).lean(),
    Membership.findOne({ profileId, userId: user.id }).lean(),
  ]);
  if (!profile || !membership) return null;
  return { user, profile: toProfileDTO(profile), membership: toMembershipDTO(membership) };
}

/** For pages: redirects to login when signed out, 404s when the user isn't in the circle. */
export const requireMemberContext = cache(async (profileId: string): Promise<MemberContext> => {
  await requireUser();
  const context = await findMemberContext(profileId);
  if (!context) notFound();
  return context;
});
