import "server-only";
import { redirect } from "next/navigation";
import type { MemberContext } from "@/lib/types";
import { findMemberContext, getCurrentUser } from "./dal";

/** Thrown when a signed-in user tries something they aren't allowed to do. Its message is safe to show. */
export class ForbiddenError extends Error {
  constructor(message = "You don’t have access to this care profile.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * Authorizes a server action against a care profile. Every action calls this itself;
 * hiding buttons in the UI is never treated as security.
 */
export async function authorizeMember(profileId: string, options: { admin?: boolean } = {}): Promise<MemberContext> {
  const context = await findMemberContext(profileId);
  if (!context) {
    if (!(await getCurrentUser())) redirect("/login");
    throw new ForbiddenError();
  }
  if (options.admin && !context.membership.isAdmin) {
    throw new ForbiddenError("Only care-circle admins can do this.");
  }
  return context;
}
