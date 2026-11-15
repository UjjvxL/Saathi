// Assigning medicines and appointments to members ("who is responsible?").
import "server-only";
import mongoose from "mongoose";
import { logActivity } from "./activity";
import { connectDB } from "./db";
import { Membership, User } from "./models";

export type AssigneeCheck = { ok: true; assignee: { id: string; name: string } | null } | { ok: false; message: string };

/** Only members of this care circle can be made responsible; checked on the server for every save. */
export async function checkAssignee(profileId: string, assigneeId: string | null | undefined): Promise<AssigneeCheck> {
  if (!assigneeId) return { ok: true, assignee: null };
  if (!mongoose.isValidObjectId(assigneeId)) return { ok: false, message: "Choose someone from the care circle." };
  await connectDB();
  const [member, user] = await Promise.all([
    Membership.exists({ profileId, userId: assigneeId }),
    User.findById(assigneeId).select("name").lean(),
  ]);
  if (!member || !user) return { ok: false, message: "That person isn’t in this care circle." };
  return { ok: true, assignee: { id: user._id.toString(), name: user.name } };
}

/** Records an assignment change in the timeline. */
export async function logAssignment(input: {
  profileId: string;
  actor: { id: string; name: string };
  what: string;
  refId: string;
  assignee: { id: string; name: string } | null;
  previousId?: string | null;
}): Promise<void> {
  const { profileId, actor, what, refId, assignee, previousId } = input;
  if ((assignee?.id ?? null) === (previousId ?? null)) return;
  await logActivity({
    profileId,
    actorId: actor.id,
    actorName: actor.name,
    kind: "responsibility",
    message: assignee
      ? `${actor.name} made ${assignee.id === actor.id ? "themself" : assignee.name} responsible for ${what}`
      : `${actor.name} removed the responsible person for ${what}`,
    status: assignee ? "assigned" : "unassigned",
    refId,
    involvedUserIds: [assignee?.id, previousId],
  });
}
