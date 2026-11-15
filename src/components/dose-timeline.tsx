import { Ban, Check, CircleX, Undo2, UserCheck } from "lucide-react";
import { markDose, markSlot, unmarkDose } from "@/app/actions/doses";
import type { DoseStatus } from "@/lib/constants";
import { dayPart, formatClock, formatTime12h, type DayPart } from "@/lib/schedule";
import type { DoseItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ActionButton } from "./ui/action-button";
import { Badge, type Tone } from "./ui/feedback";

const PART_LABEL: Record<DayPart, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
  night: "Night",
};

const STATUS: Record<DoseStatus, { label: string; tone: Tone }> = {
  taken: { label: "Taken", tone: "success" },
  skipped: { label: "Skipped", tone: "neutral" },
  missed: { label: "Missed", tone: "error" },
  unconfirmed: { label: "Unconfirmed", tone: "error" },
  pending: { label: "Pending", tone: "warning" },
  upcoming: { label: "Upcoming", tone: "info" },
};

const DECIDED: DoseStatus[] = ["taken", "skipped", "missed"];

interface Slot {
  scheduledFor: string;
  localTime: string;
  doses: DoseItem[];
}

function groupSlots(doses: DoseItem[]): Slot[] {
  const slots = new Map<string, Slot>();
  for (const dose of doses) {
    const slot = slots.get(dose.scheduledFor) ?? { scheduledFor: dose.scheduledFor, localTime: dose.localTime, doses: [] };
    slot.doses.push(dose);
    slots.set(dose.scheduledFor, slot);
  }
  return [...slots.values()];
}

function slotDot(slot: Slot): string {
  if (slot.doses.some((dose) => dose.status === "pending")) return "bg-amber-500 ring-amber-100";
  if (slot.doses.some((dose) => dose.status === "missed" || dose.status === "unconfirmed")) return "bg-red-500 ring-red-100";
  if (slot.doses.every((dose) => dose.status === "taken")) return "bg-emerald-500 ring-emerald-100";
  if (slot.doses.every((dose) => dose.status === "taken" || dose.status === "skipped")) return "bg-stone-400 ring-stone-100";
  return "bg-white ring-stone-200";
}

export function DoseTimeline({
  profileId,
  doses,
  timezone,
  memberNames = {},
  canLog = true,
}: {
  profileId: string;
  doses: DoseItem[];
  timezone: string;
  /** userId -> name, to show who is responsible for each medicine. */
  memberNames?: Record<string, string>;
  /** Whether the viewer may record doses (the server checks this too). */
  canLog?: boolean;
}) {
  const slots = groupSlots(doses);

  return (
    <ol className="relative space-y-4">
      <span
        aria-hidden="true"
        className="absolute bottom-6 left-29 top-6 hidden w-px -translate-x-1/2 bg-stone-200 sm:block"
      />
      {slots.map((slot) => {
        const open = slot.doses.filter(
          (dose) => (dose.status === "pending" || dose.status === "unconfirmed" || dose.status === "upcoming") && dose.canMark,
        );
        const hasDue = slot.doses.some((dose) => dose.status === "pending");
        return (
          <li key={slot.scheduledFor} className="grid gap-2 sm:grid-cols-[6.5rem_minmax(0,1fr)] sm:gap-6">
            <div className="flex items-baseline gap-2 sm:relative sm:block sm:pt-5 sm:text-right">
              <p className="whitespace-nowrap text-lg font-semibold tabular-nums tracking-tight text-stone-900 sm:pr-5">
                {formatTime12h(slot.localTime).split(" ")[0]}
                <span className="ml-1 text-sm font-medium text-stone-500">{formatTime12h(slot.localTime).split(" ")[1]}</span>
              </p>
              <p className="text-sm text-stone-500 sm:pr-5">{PART_LABEL[dayPart(slot.localTime)]}</p>
              <span
                aria-hidden="true"
                className={cn("absolute right-[-1.0625rem] top-[1.8rem] hidden size-2.5 rounded-full ring-4 sm:block", slotDot(slot))}
              />
            </div>
            <div
              className={cn(
                "overflow-hidden rounded-2xl border bg-white shadow-soft",
                hasDue ? "border-amber-300 ring-4 ring-amber-50" : "border-stone-200/80",
              )}
            >
              <ul className="divide-y divide-stone-100">
                {slot.doses.map((dose) => (
                  <DoseRow
                    key={dose.key}
                    profileId={profileId}
                    dose={dose}
                    timezone={timezone}
                    assigneeName={dose.assigneeId ? memberNames[dose.assigneeId] : undefined}
                    canLog={canLog}
                  />
                ))}
              </ul>
              {canLog && open.length >= 2 ? (
                <div className="flex items-center justify-between gap-3 border-t border-stone-100 bg-stone-50/70 px-5 py-3">
                  <p className="text-sm text-stone-600">Took them all at once?</p>
                  <ActionButton
                    action={markSlot.bind(null, profileId, slot.scheduledFor, "taken")}
                    variant="success"
                    size="sm"
                    pendingLabel="Saving…"
                  >
                    <Check aria-hidden="true" /> I took all {open.length}
                  </ActionButton>
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function DoseRow({
  profileId,
  dose,
  timezone,
  assigneeName,
  canLog,
}: {
  profileId: string;
  dose: DoseItem;
  timezone: string;
  assigneeName?: string;
  canLog: boolean;
}) {
  const decided = DECIDED.includes(dose.status);
  return (
    <li className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-lg font-medium tracking-tight text-stone-900">
            {dose.name}
            {dose.dosage ? <span className="font-normal text-stone-500"> · {dose.dosage}</span> : null}
          </p>
          <Badge tone={STATUS[dose.status].tone} dot>
            {STATUS[dose.status].label}
          </Badge>
        </div>
        {dose.instructions ? <p className="text-stone-600">{dose.instructions}</p> : null}
        {decided && dose.loggedByName ? (
          <p className="text-sm text-stone-500">
            {dose.status === "taken" ? "Taken" : dose.status === "skipped" ? "Skipped" : "Not taken"}
            {dose.status === "taken" && dose.takenAt ? ` at ${formatClock(new Date(dose.takenAt), timezone)}` : ""} ·
            marked by {dose.loggedByName}
          </p>
        ) : null}
        {dose.status === "unconfirmed" ? <FollowUpNote dose={dose} timezone={timezone} /> : null}
        {assigneeName ? (
          <p className="flex items-center gap-1.5 text-sm text-stone-500">
            <UserCheck className="size-3.5" aria-hidden="true" /> Responsible: {assigneeName}
          </p>
        ) : null}
      </div>
      {canLog ? <DoseActions profileId={profileId} dose={dose} /> : null}
    </li>
  );
}

/** Who is following up on an unconfirmed dose (from its escalation). */
function FollowUpNote({ dose, timezone }: { dose: DoseItem; timezone: string }) {
  if (!dose.alert) return <p className="text-sm text-red-800">Nobody confirmed this dose in time.</p>;
  if (dose.alert.status === "acknowledged" && dose.alert.acknowledgedByName) {
    return (
      <p className="text-sm text-stone-600">
        {dose.alert.acknowledgedByName} is following up
        {dose.alert.acknowledgedAt ? ` (since ${formatClock(new Date(dose.alert.acknowledgedAt), timezone)})` : ""}.
      </p>
    );
  }
  return <p className="text-sm text-red-800">The care circle was alerted. Waiting for someone to follow up.</p>;
}

function DoseActions({ profileId, dose }: { profileId: string; dose: DoseItem }) {
  if (DECIDED.includes(dose.status)) {
    return (
      <ActionButton
        action={unmarkDose.bind(null, profileId, dose.medicationId, dose.scheduledFor)}
        variant="ghost"
        size="sm"
        ariaLabel={`Undo ${dose.status} for ${dose.name}`}
      >
        <Undo2 aria-hidden="true" /> Undo
      </ActionButton>
    );
  }
  if (!dose.canMark) return null;
  const prominent = dose.status === "pending";
  const late = dose.status === "unconfirmed";
  return (
    <div className="flex flex-wrap items-start gap-2">
      <ActionButton
        action={markDose.bind(null, profileId, dose.medicationId, dose.scheduledFor, "taken")}
        variant={prominent ? "success" : "primary"}
        size={prominent ? "lg" : "md"}
        pendingLabel="Saving…"
      >
        <Check aria-hidden="true" /> {late ? "Taken late" : "I took it"}{" "}
        <span className="sr-only">for {dose.name}</span>
      </ActionButton>
      <ActionButton
        action={markDose.bind(null, profileId, dose.medicationId, dose.scheduledFor, "skipped")}
        variant="secondary"
        size={prominent ? "lg" : "md"}
      >
        <CircleX aria-hidden="true" /> Skip <span className="sr-only">{dose.name}</span>
      </ActionButton>
      {late ? (
        <ActionButton
          action={markDose.bind(null, profileId, dose.medicationId, dose.scheduledFor, "missed")}
          variant="secondary"
          confirmMessage={`Record that ${dose.name} was not taken?`}
        >
          <Ban aria-hidden="true" /> Not taken <span className="sr-only">{dose.name}</span>
        </ActionButton>
      ) : null}
    </div>
  );
}
