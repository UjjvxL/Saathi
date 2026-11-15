import { BellRing, CheckCircle2, Clock, Hand, Megaphone, Send, Siren, UserCheck } from "lucide-react";
import Link from "next/link";
import { acknowledgeAlertAction } from "@/app/actions/alerts";
import { ALERT_STATUS_LABELS } from "@/lib/constants";
import { formatClock, formatInstant, formatLocalDate, formatTime12h } from "@/lib/schedule";
import type { AlertDTO } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ActionButton } from "./ui/action-button";
import { Badge, type Tone } from "./ui/feedback";

const STATUS_TONE: Record<AlertDTO["status"], Tone> = { open: "error", acknowledged: "warning", resolved: "success" };

const RESOLUTION_LABEL: Record<string, string> = {
  taken: "taken",
  skipped: "skipped",
  missed: "not taken",
  mixed: "recorded",
};

interface Step {
  icon: typeof Clock;
  label: string;
  at: string | null;
  done: boolean;
  tone?: "alert" | "ok";
}

/** Every step of one escalation, in order: the accountability trail for a single dose slot. */
export function alertSteps(alert: AlertDTO): Step[] {
  const steps: Step[] = [
    { icon: Clock, label: `Due at ${formatTime12h(alert.localTime)}`, at: alert.slot, done: true },
    { icon: Send, label: "Reminder sent", at: alert.reminderSentAt, done: Boolean(alert.reminderSentAt) },
    { icon: BellRing, label: "Follow-up reminder sent", at: alert.followUpSentAt, done: Boolean(alert.followUpSentAt) },
    {
      icon: Siren,
      label: alert.notifiedNames.length
        ? `Unconfirmed: ${alert.notifiedNames.join(", ")} alerted`
        : "Unconfirmed: shown in the app (nobody has email alerts on)",
      at: alert.escalatedAt,
      done: true,
      tone: "alert",
    },
  ];
  if (alert.widenedAt) {
    steps.push({
      icon: Megaphone,
      label: alert.widenedNames.length
        ? `No response yet: ${alert.widenedNames.join(", ")} alerted too`
        : "No response yet (nobody else to alert)",
      at: alert.widenedAt,
      done: true,
      tone: "alert",
    });
  }
  steps.push({
    icon: UserCheck,
    label: alert.acknowledgedByName ? `${alert.acknowledgedByName} acknowledged and is following up` : "Waiting for someone to acknowledge",
    at: alert.acknowledgedAt,
    done: Boolean(alert.acknowledgedAt),
    tone: "ok",
  });
  steps.push({
    icon: CheckCircle2,
    label:
      alert.status === "resolved"
        ? `Resolved: marked ${RESOLUTION_LABEL[alert.resolution ?? "mixed"] ?? "recorded"}${alert.resolvedByName ? ` by ${alert.resolvedByName}` : ""}`
        : "Not resolved yet: record what happened on the Today page",
    at: alert.resolvedAt,
    done: alert.status === "resolved",
    tone: "ok",
  });
  return steps;
}

export function AlertSteps({ alert, timezone }: { alert: AlertDTO; timezone: string }) {
  return (
    <ol className="space-y-2.5">
      {alertSteps(alert).map((step, index) => {
        const Icon = step.icon;
        return (
          <li key={index} className={cn("flex items-start gap-3 text-[0.95rem]", step.done ? "text-stone-800" : "text-stone-500")}>
            <span
              aria-hidden="true"
              className={cn(
                "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full [&_svg]:size-3.5",
                !step.done
                  ? "border border-dashed border-stone-300 text-stone-400"
                  : step.tone === "alert"
                    ? "bg-red-100 text-red-700"
                    : step.tone === "ok"
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-stone-100 text-stone-700",
              )}
            >
              <Icon />
            </span>
            <span className="min-w-0 flex-1">{step.label}</span>
            {step.at ? (
              <time dateTime={step.at} className="shrink-0 text-sm tabular-nums text-stone-500">
                {formatClock(new Date(step.at), timezone)}
              </time>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

export function AlertCard({
  alert,
  profileId,
  timezone,
  canAcknowledge,
  showDate = false,
}: {
  alert: AlertDTO;
  profileId: string;
  timezone: string;
  canAcknowledge: boolean;
  showDate?: boolean;
}) {
  return (
    <article
      className={cn(
        "space-y-4 rounded-2xl border bg-white p-5 shadow-soft",
        alert.status === "open" ? "border-red-200 ring-4 ring-red-50" : "border-stone-200/80",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-stone-500">
            {showDate ? `${formatLocalDate(alert.localDate)} · ` : ""}
            {formatTime12h(alert.localTime)} dose
          </p>
          <h3 className="mt-0.5 text-lg font-semibold tracking-tight text-stone-900">{alert.medicines.join(", ")}</h3>
        </div>
        <Badge tone={STATUS_TONE[alert.status]} dot>
          {ALERT_STATUS_LABELS[alert.status]}
        </Badge>
      </div>
      <AlertSteps alert={alert} timezone={timezone} />
      {alert.status !== "resolved" ? (
        <div className="flex flex-wrap items-start gap-2 border-t border-stone-100 pt-4">
          {alert.status === "open" && canAcknowledge ? (
            <ActionButton
              action={acknowledgeAlertAction.bind(null, profileId, alert.id)}
              variant="danger"
              pendingLabel="Saving…"
            >
              <Hand aria-hidden="true" /> I’m on it <span className="sr-only">({formatTime12h(alert.localTime)} alert)</span>
            </ActionButton>
          ) : null}
          <Link
            href={`/p/${profileId}`}
            className="inline-flex min-h-12 items-center rounded-xl px-3 text-[0.95rem] font-medium text-teal-800 underline-offset-4 hover:underline"
          >
            Record what happened
          </Link>
        </div>
      ) : alert.resolvedAt ? (
        <p className="text-sm text-stone-500">Closed {formatInstant(new Date(alert.resolvedAt), timezone)}</p>
      ) : null}
    </article>
  );
}
