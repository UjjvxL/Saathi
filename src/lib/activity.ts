import "server-only";
import { Activity } from "./models";

export type ActivityKind = "dose" | "medication" | "appointment" | "member" | "profile" | "alert";

/** Records an entry in the profile's audit trail. Never throws: logging must not break the action. */
export async function logActivity(entry: {
  profileId: string;
  actorId?: string | null;
  actorName: string;
  kind: ActivityKind;
  message: string;
}): Promise<void> {
  try {
    await Activity.create({
      profileId: entry.profileId,
      actorId: entry.actorId ?? null,
      actorName: entry.actorName,
      kind: entry.kind,
      message: entry.message.slice(0, 300),
    });
  } catch (error) {
    console.error("[activity] could not record entry", error);
  }
}
