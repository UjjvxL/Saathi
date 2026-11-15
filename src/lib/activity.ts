import "server-only";
import type { ActivityKind } from "./constants";
import { Activity } from "./models";

export type { ActivityKind };

/**
 * Records an entry in the profile's care timeline (the audit trail). Never throws: logging must not
 * break the action. The actor always counts as involved, so the member filter finds their own actions.
 */
export async function logActivity(entry: {
  profileId: string;
  actorId?: string | null;
  actorName: string;
  kind: ActivityKind;
  message: string;
  /** Status of the dose, alert or task right after this event. */
  status?: string | null;
  /** The alert, medicine or appointment this is about. */
  refId?: string | null;
  /** Other members involved (notified, assigned, …). */
  involvedUserIds?: (string | null | undefined)[];
}): Promise<void> {
  try {
    const involved = [...new Set([entry.actorId, ...(entry.involvedUserIds ?? [])].filter((id): id is string => Boolean(id)))];
    await Activity.create({
      profileId: entry.profileId,
      actorId: entry.actorId ?? null,
      actorName: entry.actorName,
      kind: entry.kind,
      message: entry.message.slice(0, 300),
      status: entry.status ?? null,
      refId: entry.refId ?? null,
      involvedUserIds: involved,
    });
  } catch (error) {
    console.error("[activity] could not record entry", error);
  }
}
