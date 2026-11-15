import "server-only";
import { redirect } from "next/navigation";
import { can, FORBIDDEN_MESSAGES, type Capability } from "@/lib/permissions";
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
 * Authorizes a server action against a care profile: the user must be in its care circle and, when
 * asked, have the role-based capability (see lib/permissions.ts). Every action calls this itself;
 * hiding buttons in the UI is never treated as security.
 */
export async function authorizeMember(
  profileId: string,
  options: { admin?: boolean; capability?: Capability } = {},
): Promise<MemberContext> {
  const context = await findMemberContext(profileId);
  if (!context) {
    if (!(await getCurrentUser())) redirect("/login");
    throw new ForbiddenError();
  }
  if (options.admin && !context.membership.isAdmin) {
    throw new ForbiddenError(FORBIDDEN_MESSAGES.manageCircle);
  }
  if (options.capability && !can(context.membership, options.capability)) {
    throw new ForbiddenError(FORBIDDEN_MESSAGES[options.capability]);
  }
  return context;
}
