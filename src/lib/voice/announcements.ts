// Decides when Elderly mode reads a reminder aloud while the screen is open: once when a dose becomes
// due, and once more if it's still waiting at the profile's follow-up time. Pure, so it is easy to test.
import type { DoseStatus } from "@/lib/constants";
import { announcement, type VoiceDose } from "./replies";

export interface Announcement {
  /** Stable id, so the same reminder is never read twice. */
  id: string;
  kind: "due" | "follow-up";
  doses: VoiceDose[];
  text: string;
}

const WAITING: DoseStatus[] = ["upcoming", "pending", "unconfirmed"];
/** How long after the follow-up time a follow-up is still worth reading out. */
const FOLLOW_UP_WINDOW_MINUTES = 60;

export function announcementsDue(
  doses: VoiceDose[],
  now: Date,
  followUpAfterMinutes: number,
  alreadyAnnounced: ReadonlySet<string>,
  idPrefix = "",
): Announcement[] {
  const slots = new Map<string, VoiceDose[]>();
  for (const dose of doses) {
    if (!WAITING.includes(dose.status)) continue;
    slots.set(dose.scheduledFor, [...(slots.get(dose.scheduledFor) ?? []), dose]);
  }

  const due: Announcement[] = [];
  for (const [slot, slotDoses] of [...slots].sort(([a], [b]) => a.localeCompare(b))) {
    const minutesLate = (now.getTime() - new Date(slot).getTime()) / 60_000;
    let kind: Announcement["kind"] | null = null;
    if (minutesLate >= 0 && minutesLate < followUpAfterMinutes) kind = "due";
    else if (minutesLate >= followUpAfterMinutes && minutesLate < followUpAfterMinutes + FOLLOW_UP_WINDOW_MINUTES) kind = "follow-up";
    if (!kind) continue;
    const id = `${idPrefix}${slot}:${kind}`;
    if (alreadyAnnounced.has(id)) continue;
    due.push({ id, kind, doses: slotDoses, text: announcement(slotDoses, kind) });
  }
  return due;
}
