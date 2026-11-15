import {
  BellRing,
  CalendarClock,
  ClipboardCheck,
  Filter,
  Hand,
  History,
  type LucideIcon,
  Pill,
  Settings,
  Siren,
  Stethoscope,
  Users,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { AlertCard } from "@/components/alert-card";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge, LoadingCards, PageHeader, type Tone } from "@/components/ui/feedback";
import { inputStyles } from "@/components/ui/field";
import { requireMemberContext } from "@/lib/auth/dal";
import { ACTIVITY_KIND_LABELS, ACTIVITY_KINDS, type ActivityKind } from "@/lib/constants";
import { getMembers, getTimeline, type TimelineFilters } from "@/lib/data";
import { can } from "@/lib/permissions";
import { formatClock, formatLongDate, isValidDate, shiftDate, todayInZone, utcToZoned } from "@/lib/schedule";
import type { ActivityDTO } from "@/lib/types";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Timeline" };

const MAX_DAYS = 92;

export default function TimelinePage({ params, searchParams }: PageProps<"/p/[profileId]/timeline">) {
  return (
    <>
      <PageHeader
        as="h2"
        title="Care timeline"
        description="Every reminder, escalation, acknowledgement and change, with who did it. Nothing here can be edited."
      />
      <Suspense fallback={<LoadingCards count={3} label="Loading timeline" />}>
        <TimelineView params={params} searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const KIND_ICON: Record<ActivityKind, LucideIcon> = {
  dose: ClipboardCheck,
  reminder: BellRing,
  alert: Siren,
  acknowledgement: Hand,
  responsibility: Users,
  medication: Pill,
  appointment: Stethoscope,
  member: Users,
  profile: Settings,
};

const KIND_STYLE: Record<ActivityKind, string> = {
  dose: "bg-emerald-100 text-emerald-800",
  reminder: "bg-sky-100 text-sky-800",
  alert: "bg-red-100 text-red-700",
  acknowledgement: "bg-amber-100 text-amber-800",
  responsibility: "bg-violet-100 text-violet-800",
  medication: "bg-teal-100 text-teal-800",
  appointment: "bg-teal-100 text-teal-800",
  member: "bg-stone-100 text-stone-700",
  profile: "bg-stone-100 text-stone-700",
};

const STATUS_CHIP: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "Pending", tone: "warning" },
  unconfirmed: { label: "Unconfirmed", tone: "error" },
  open: { label: "Waiting", tone: "error" },
  acknowledged: { label: "Acknowledged", tone: "warning" },
  resolved: { label: "Resolved", tone: "success" },
  taken: { label: "Taken", tone: "success" },
  skipped: { label: "Skipped", tone: "neutral" },
  missed: { label: "Missed", tone: "error" },
  assigned: { label: "Assigned", tone: "info" },
  unassigned: { label: "Unassigned", tone: "neutral" },
  scheduled: { label: "Scheduled", tone: "info" },
  completed: { label: "Done", tone: "success" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

function readFilters(query: Record<string, string | string[] | undefined>, today: string): TimelineFilters & { preset: string } {
  const one = (key: string) => (typeof query[key] === "string" ? (query[key] as string) : "");
  const preset = one("range");
  let to = isValidDate(one("to")) ? one("to") : today;
  let from = isValidDate(one("from")) ? one("from") : shiftDate(today, preset === "today" ? 0 : preset === "30d" ? -29 : -6);
  if (preset === "today") from = to = today;
  if (from > to) [from, to] = [to, from];
  if (shiftDate(from, MAX_DAYS) < to) from = shiftDate(to, -(MAX_DAYS - 1));
  const kind = ACTIVITY_KINDS.includes(one("type") as ActivityKind) ? (one("type") as ActivityKind) : null;
  const member = one("member") || null;
  return { from, to, kind, member, preset };
}

async function TimelineView({
  params,
  searchParams,
}: {
  params: Promise<{ profileId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ profileId }, query] = await Promise.all([params, searchParams]);
  const { profile, membership } = await requireMemberContext(profileId);
  const today = todayInZone(profile.timezone);
  const filters = readFilters(query, today);
  const [members, timeline] = await Promise.all([getMembers(profile.id), getTimeline(profile, filters)]);
  const base = `/p/${profile.id}/timeline`;
  const memberFilter = filters.member === "saathi" || members.some((m) => m.userId === filters.member) ? filters.member : null;

  // Group entries by local day (newest first).
  const days = new Map<string, ActivityDTO[]>();
  for (const entry of timeline.entries) {
    const { localDate } = utcToZoned(new Date(entry.createdAt), profile.timezone);
    days.set(localDate, [...(days.get(localDate) ?? []), entry]);
  }

  const quick = [
    { range: "today", label: "Today" },
    { range: "7d", label: "Last 7 days" },
    { range: "30d", label: "Last 30 days" },
  ];

  return (
    <div className="space-y-8">
      <Card>
        <form method="get" action={base} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto] lg:items-end">
          <FilterField label="From">
            <input type="date" name="from" defaultValue={filters.from} max={today} className={inputStyles} />
          </FilterField>
          <FilterField label="To">
            <input type="date" name="to" defaultValue={filters.to} max={today} className={inputStyles} />
          </FilterField>
          <FilterField label="Event type">
            <select name="type" defaultValue={filters.kind ?? ""} className={inputStyles}>
              <option value="">All events</option>
              {ACTIVITY_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {ACTIVITY_KIND_LABELS[kind]}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Member">
            <select name="member" defaultValue={memberFilter ?? ""} className={inputStyles}>
              <option value="">Everyone</option>
              <option value="saathi">Saathi (automatic)</option>
              {members.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.name}
                </option>
              ))}
            </select>
          </FilterField>
          <Button type="submit" variant="primary">
            <Filter aria-hidden="true" /> Show
          </Button>
        </form>
        <nav aria-label="Quick ranges" className="mt-4 flex flex-wrap gap-2">
          {quick.map((option) => (
            <Link
              key={option.range}
              href={`${base}?range=${option.range}`}
              className="inline-flex h-9 items-center rounded-full border border-stone-200 bg-white px-3.5 text-sm font-medium text-stone-700 hover:border-stone-300 hover:text-stone-900"
            >
              {option.label}
            </Link>
          ))}
        </nav>
      </Card>

      {timeline.alerts.length ? (
        <section aria-labelledby="escalations" className="space-y-4">
          <h3 id="escalations" className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <Siren className="size-5 text-red-700" aria-hidden="true" /> Escalation history ({timeline.alerts.length})
          </h3>
          <ul className="grid gap-4 lg:grid-cols-2">
            {timeline.alerts.map((alert) => (
              <li key={alert.id}>
                <AlertCard
                  alert={alert}
                  profileId={profile.id}
                  timezone={profile.timezone}
                  canAcknowledge={can(membership, "acknowledgeAlerts")}
                  showDate
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Card>
        <CardHeader
          title={`${timeline.entries.length}${timeline.truncated ? "+" : ""} events`}
          icon={<History />}
          as="h3"
          description={`${formatLongDate(filters.from)} to ${formatLongDate(filters.to)}${filters.kind ? ` · ${ACTIVITY_KIND_LABELS[filters.kind]}` : ""}${
            memberFilter === "saathi"
              ? " · Saathi (automatic)"
              : memberFilter
                ? ` · ${members.find((m) => m.userId === memberFilter)?.name ?? ""}`
                : ""
          }`}
        />
        {days.size ? (
          <div className="space-y-8">
            {[...days.entries()].map(([date, entries]) => (
              <section key={date} aria-label={formatLongDate(date)}>
                <h4 className="mb-3 flex items-center gap-2 text-[0.95rem] font-semibold text-stone-700">
                  <CalendarClock className="size-4 text-stone-500" aria-hidden="true" /> {formatLongDate(date)}
                </h4>
                <ol className="relative space-y-4 before:absolute before:bottom-2 before:left-[0.9375rem] before:top-2 before:w-px before:bg-stone-200">
                  {entries.map((entry) => (
                    <TimelineRow key={entry.id} entry={entry} timezone={profile.timezone} />
                  ))}
                </ol>
              </section>
            ))}
            {timeline.truncated ? (
              <p className="text-sm text-stone-500">Showing the newest {timeline.entries.length}. Narrow the dates to see older events.</p>
            ) : null}
          </div>
        ) : (
          <p className="text-stone-500">No events match these filters.</p>
        )}
      </Card>
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-[0.95rem] font-medium text-stone-800">{label}</span>
      {children}
    </label>
  );
}

function TimelineRow({ entry, timezone }: { entry: ActivityDTO; timezone: string }) {
  const Icon = KIND_ICON[entry.kind];
  const chip = entry.status ? STATUS_CHIP[entry.status] : undefined;
  const automatic = entry.actorId === null && entry.actorName === "Saathi";
  return (
    <li className="relative flex gap-4">
      <span
        aria-hidden="true"
        className={cn(
          "relative flex size-8 shrink-0 items-center justify-center rounded-full ring-4 ring-white [&_svg]:size-4",
          KIND_STYLE[entry.kind],
        )}
      >
        <Icon />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <time dateTime={entry.createdAt} className="text-sm font-semibold tabular-nums text-stone-900">
            {formatClock(new Date(entry.createdAt), timezone)}
          </time>
          <span className="text-sm font-medium text-stone-500">{ACTIVITY_KIND_LABELS[entry.kind]}</span>
          {chip ? (
            <Badge tone={chip.tone} dot>
              {chip.label}
            </Badge>
          ) : null}
        </div>
        <p className="mt-0.5 text-stone-800">{entry.message}</p>
        <p className="text-sm text-stone-500">{automatic ? "Saathi (automatic)" : `By ${entry.actorName}`}</p>
      </div>
    </li>
  );
}
