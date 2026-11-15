import { Check, CircleX, Undo2 } from "lucide-react";
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
  due: { label: "Take now", tone: "warning" },
  upcoming: { label: "Later", tone: "info" },
};

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
  if (slot.doses.some((dose) => dose.status === "due")) return "bg-amber-500 ring-amber-100";
  if (slot.doses.some((dose) => dose.status === "missed")) return "bg-red-500 ring-red-100";
  if (slot.doses.every((dose) => dose.status === "taken")) return "bg-emerald-500 ring-emerald-100";
  if (slot.doses.every((dose) => dose.status === "taken" || dose.status === "skipped")) return "bg-stone-400 ring-stone-100";
  return "bg-white ring-stone-200";
}

export function DoseTimeline({ profileId, doses, timezone }: { profileId: string; doses: DoseItem[]; timezone: string }) {
  const slots = groupSlots(doses);

  return (
    <ol className="relative space-y-4">
      <span
        aria-hidden="true"
        className="absolute bottom-6 left-29 top-6 hidden w-px -translate-x-1/2 bg-stone-200 sm:block"
      />
      {slots.map((slot) => {
        const open = slot.doses.filter(
          (dose) => (dose.status === "due" || dose.status === "missed" || dose.status === "upcoming") && dose.canMark,
        );
        const hasDue = slot.doses.some((dose) => dose.status === "due");
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
                  <DoseRow key={dose.key} profileId={profileId} dose={dose} timezone={timezone} />
                ))}
              </ul>
              {open.length >= 2 ? (
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

function DoseRow({ profileId, dose, timezone }: { profileId: string; dose: DoseItem; timezone: string }) {
  const decided = dose.status === "taken" || dose.status === "skipped";
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
            {dose.status === "taken" ? "Taken" : "Skipped"}
            {dose.status === "taken" && dose.takenAt ? ` at ${formatClock(new Date(dose.takenAt), timezone)}` : ""} ·
            marked by {dose.loggedByName}
          </p>
        ) : null}
      </div>
      <DoseActions profileId={profileId} dose={dose} />
    </li>
  );
}

function DoseActions({ profileId, dose }: { profileId: string; dose: DoseItem }) {
  if (dose.status === "taken" || dose.status === "skipped") {
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
  const prominent = dose.status === "due";
  return (
    <div className="flex flex-wrap items-start gap-2">
      <ActionButton
        action={markDose.bind(null, profileId, dose.medicationId, dose.scheduledFor, "taken")}
        variant={prominent ? "success" : "primary"}
        size={prominent ? "lg" : "md"}
        pendingLabel="Saving…"
      >
        <Check aria-hidden="true" /> {dose.status === "missed" ? "Taken late" : "I took it"}{" "}
        <span className="sr-only">for {dose.name}</span>
      </ActionButton>
      <ActionButton
        action={markDose.bind(null, profileId, dose.medicationId, dose.scheduledFor, "skipped")}
        variant="secondary"
        size={prominent ? "lg" : "md"}
      >
        <CircleX aria-hidden="true" /> Skip <span className="sr-only">{dose.name}</span>
      </ActionButton>
    </div>
  );
}
