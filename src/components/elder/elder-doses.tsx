"use client";

import { BellRing, Check, CircleAlert, CircleCheck, CircleMinus, CircleX, Clock, LoaderCircle, PartyPopper, Pill } from "lucide-react";
import { useActionState, type ReactNode } from "react";
import { markDose } from "@/app/actions/doses";
import { DOSE_STATUS_LABELS, type DoseStatus } from "@/lib/constants";
import { formatTime12h } from "@/lib/format";
import type { DoseItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { FormState } from "@/lib/validation";
import { elderButton, elderCard, type ElderButtonVariant } from "./styles";

/** Status wording for elders: plain words, an icon, and never colour alone. */
const ELDER_STATUS: Record<DoseStatus, { label: string; className: string; icon: ReactNode }> = {
  pending: { label: "Time to take now", className: "bg-amber-100 text-amber-950 ring-amber-700/30", icon: <BellRing aria-hidden="true" /> },
  unconfirmed: { label: "Not confirmed yet", className: "bg-red-50 text-red-900 ring-red-700/25", icon: <CircleAlert aria-hidden="true" /> },
  upcoming: { label: "Later today", className: "bg-sky-50 text-sky-950 ring-sky-700/20", icon: <Clock aria-hidden="true" /> },
  taken: { label: DOSE_STATUS_LABELS.taken, className: "bg-emerald-50 text-emerald-900 ring-emerald-700/25", icon: <CircleCheck aria-hidden="true" /> },
  skipped: { label: DOSE_STATUS_LABELS.skipped, className: "bg-stone-100 text-stone-800 ring-stone-500/25", icon: <CircleMinus aria-hidden="true" /> },
  missed: { label: "Not taken", className: "bg-red-50 text-red-900 ring-red-700/25", icon: <CircleX aria-hidden="true" /> },
};

export function ElderStatus({ status }: { status: DoseStatus }) {
  const { label, className, icon } = ELDER_STATUS[status];
  return (
    <span className={cn("inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-lg font-semibold ring-1 ring-inset [&_svg]:size-5", className)}>
      {icon}
      {label}
    </span>
  );
}

type BoundAction = (state: FormState, formData: FormData) => Promise<FormState>;

/** A big one-button form for a server action, with a pending state and an honest error message. */
function DoseButton({
  action,
  variant,
  children,
  className,
}: {
  action: BoundAction;
  variant: ElderButtonVariant;
  children: ReactNode;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className={cn("flex flex-col gap-2", className)}>
      <button type="submit" disabled={pending} aria-busy={pending} className={elderButton(variant, "w-full")}>
        {pending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
        {children}
      </button>
      {state.message && !state.ok ? (
        <p role="alert" className="text-lg font-medium text-red-800">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

function label(dose: DoseItem): string {
  return dose.dosage ? `${dose.name} · ${dose.dosage}` : dose.name;
}

const byTime = (a: DoseItem, b: DoseItem) => a.scheduledFor.localeCompare(b.scheduledFor) || a.name.localeCompare(b.name);

/** The most important card: what to take right now, with huge "I took it" / "Skip" buttons. */
export function NowCard({ profileId, doses, canLog }: { profileId: string; doses: DoseItem[]; canLog: boolean }) {
  const due = doses.filter((dose) => dose.status === "pending" || dose.status === "unconfirmed").sort(byTime);
  const upcoming = doses.filter((dose) => dose.status === "upcoming").sort(byTime);
  const next = upcoming.filter((dose) => dose.scheduledFor === upcoming[0]?.scheduledFor);

  if (due.length) {
    return (
      <section aria-labelledby="now-title" className={cn(elderCard, "border-amber-300 ring-4 ring-amber-100")}>
        <h2 id="now-title" className="flex items-center gap-3 text-3xl font-semibold tracking-tight text-stone-900 [&_svg]:size-8">
          <BellRing className="text-amber-700" aria-hidden="true" /> Time to take now
        </h2>
        <ul className="mt-5 space-y-5">
          {due.map((dose) => (
            <li key={dose.key} className="rounded-2xl border border-stone-200 bg-stone-50/60 p-5">
              <p className="text-xl font-medium text-stone-600">
                {formatTime12h(dose.localTime)}
                {dose.status === "unconfirmed" ? " · this was due earlier" : ""}
              </p>
              <p className="mt-1 text-3xl font-semibold tracking-tight text-stone-900">{dose.name}</p>
              {dose.dosage || dose.instructions ? (
                <p className="mt-1 text-xl text-stone-700">{[dose.dosage, dose.instructions].filter(Boolean).join(" · ")}</p>
              ) : null}
              {canLog && dose.canMark ? (
                <div className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                  <DoseButton action={markDose.bind(null, profileId, dose.medicationId, dose.scheduledFor, "taken")} variant="success">
                    <Check aria-hidden="true" /> I took it <span className="sr-only">for {dose.name}</span>
                  </DoseButton>
                  <DoseButton action={markDose.bind(null, profileId, dose.medicationId, dose.scheduledFor, "skipped")} variant="secondary">
                    Skip <span className="sr-only">{dose.name}</span>
                  </DoseButton>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    );
  }

  if (next.length) {
    return (
      <section aria-labelledby="now-title" className={elderCard}>
        <h2 id="now-title" className="text-2xl font-semibold tracking-tight text-stone-700">
          Next medicine at {formatTime12h(next[0].localTime)}
        </h2>
        <ul className="mt-4 space-y-4">
          {next.map((dose) => (
            <li key={dose.key}>
              <p className="text-3xl font-semibold tracking-tight text-stone-900">{dose.name}</p>
              {dose.dosage || dose.instructions ? (
                <p className="mt-1 text-xl text-stone-700">{[dose.dosage, dose.instructions].filter(Boolean).join(" · ")}</p>
              ) : null}
              {canLog && dose.canMark ? (
                <DoseButton
                  action={markDose.bind(null, profileId, dose.medicationId, dose.scheduledFor, "taken")}
                  variant="secondary"
                  className="mt-4 sm:max-w-sm"
                >
                  <Check aria-hidden="true" /> I’ve already taken it <span className="sr-only">({dose.name})</span>
                </DoseButton>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <section aria-labelledby="now-title" className={cn(elderCard, doses.length ? "border-emerald-200 bg-emerald-50/50" : "")}>
      <h2 id="now-title" className="flex items-center gap-3 text-3xl font-semibold tracking-tight text-stone-900 [&_svg]:size-8">
        {doses.length ? (
          <>
            <PartyPopper className="text-emerald-700" aria-hidden="true" /> All done for today
          </>
        ) : (
          <>
            <Pill className="text-stone-500" aria-hidden="true" /> No medicines today
          </>
        )}
      </h2>
      <p className="mt-2 text-xl text-stone-700">
        {doses.length ? "Every medicine for today has been recorded. Well done!" : "There’s nothing scheduled for today."}
      </p>
    </section>
  );
}

/** Every medicine for today as a big card, in time order. */
export function TodayList({ doses }: { doses: DoseItem[] }) {
  if (!doses.length) return null;
  return (
    <section aria-labelledby="today-title" className="space-y-4">
      <h2 id="today-title" className="text-3xl font-semibold tracking-tight text-stone-900">
        Today’s medicines
      </h2>
      <ul className="space-y-3">
        {[...doses].sort(byTime).map((dose) => (
          <li
            key={dose.key}
            className="grid gap-3 rounded-3xl border border-stone-200/80 bg-white p-5 shadow-soft sm:grid-cols-[7.5rem_minmax(0,1fr)_auto] sm:items-center"
          >
            <p className="text-2xl font-semibold tabular-nums tracking-tight text-stone-900">{formatTime12h(dose.localTime)}</p>
            <div className="min-w-0">
              <p className="text-2xl font-semibold tracking-tight text-stone-900">{label(dose)}</p>
              {dose.instructions ? <p className="text-lg text-stone-700">{dose.instructions}</p> : null}
              {(dose.status === "taken" || dose.status === "skipped" || dose.status === "missed") && dose.loggedByName ? (
                <p className="text-lg text-stone-600">Marked by {dose.loggedByName}</p>
              ) : null}
            </div>
            <div>
              <ElderStatus status={dose.status} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
