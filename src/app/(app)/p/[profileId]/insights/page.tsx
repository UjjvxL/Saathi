import {
  CalendarDays,
  ChartColumn,
  CircleCheck,
  ClipboardList,
  Database,
  Info,
  MapPin,
  Minus,
  Pill,
  Repeat,
  Siren,
  Sparkles,
  Stethoscope,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
} from "lucide-react";
import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { summarizeInsights } from "@/app/actions/insights";
import { AiSummary } from "@/components/insights/ai-summary";
import { DoseHistoryGrid } from "@/components/insights/dose-history-grid";
import { StatusBar } from "@/components/insights/status-bar";
import { TrendChart } from "@/components/insights/trend-chart";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge, EmptyState, LoadingCards, type Tone } from "@/components/ui/feedback";
import { isAiConfigured } from "@/lib/ai/gemini";
import { requireMemberContext } from "@/lib/auth/dal";
import { ALERT_STATUS_LABELS, type AlertStatus } from "@/lib/constants";
import { getInsights } from "@/lib/insights";
import { periodLabel, type Insight, type IncidentRow, type InsightsReport, type PatternGroup } from "@/lib/insights-core";
import { formatInstant } from "@/lib/schedule";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Health insights" };

export default function InsightsPage({ params }: PageProps<"/p/[profileId]/insights">) {
  return (
    <Suspense fallback={<LoadingCards count={4} label="Loading health insights" />}>
      <InsightsView params={params} />
    </Suspense>
  );
}

function rateTone(rate: number | null): string {
  if (rate === null) return "text-stone-500";
  if (rate >= 90) return "text-emerald-700";
  if (rate >= 70) return "text-amber-700";
  return "text-red-700";
}

const formatRate = (rate: number | null) => (rate === null ? "–" : `${rate}%`);

async function InsightsView({ params }: { params: Promise<{ profileId: string }> }) {
  const { profileId } = await params;
  const { profile } = await requireMemberContext(profileId);
  const report = await getInsights(profile);
  const base = `/p/${profile.id}`;
  const hasHistory = report.week.scheduled > 0 || report.patterns.counted > 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Health insights</h2>
          <p className="text-stone-500">
            {periodLabel(report.week.from, report.week.to)} · last 7 days, compared with the week before
          </p>
        </div>
        <a href="#data-used" className="text-[0.95rem] font-medium text-teal-800 underline-offset-4 hover:underline">
          How these numbers are worked out
        </a>
      </div>

      <Card>
        <CardHeader
          title="This week in brief"
          icon={<Sparkles />}
          description="Worked out from the doses the care circle recorded. Saathi describes routines only: it doesn’t diagnose or give medical advice."
        />
        <InsightList insights={report.insights} />
        {isAiConfigured() && report.week.summary.total ? (
          <div className="mt-5 border-t border-stone-100 pt-5">
            <AiSummary action={summarizeInsights.bind(null, profile.id)} />
          </div>
        ) : null}
      </Card>

      {hasHistory ? (
        <>
          <KpiTiles report={report} />

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <Card>
              <CardHeader title="Daily adherence" icon={<ChartColumn />} as="h3" />
              <TrendChart days={report.week.days} />
            </Card>
            <Card>
              <CardHeader
                title="Taken vs not taken"
                icon={<ClipboardList />}
                as="h3"
                description={`${report.week.summary.total} counted ${report.week.summary.total === 1 ? "dose" : "doses"} this week.`}
              />
              <StatusBar summary={report.week.summary} />
            </Card>
          </div>

          <Card>
            <CardHeader
              title="Medication history"
              icon={<CalendarDays />}
              as="h3"
              description="Every scheduled dose this week and what was recorded for it."
            />
            {report.doseHistory.length ? (
              <DoseHistoryGrid rows={report.doseHistory} days={report.week.days} />
            ) : (
              <p className="text-stone-500">No doses were scheduled this week.</p>
            )}
          </Card>

          <div className="grid items-start gap-6 lg:grid-cols-2">
            <FrequentlyMissed report={report} />
            <Patterns report={report} />
          </div>

          <MedicineTable report={report} />
        </>
      ) : (
        <EmptyState
          icon={<Pill />}
          title="No medicine history yet"
          actions={<ButtonLink href={`${base}/medications/new`}>Add a medicine</ButtonLink>}
        >
          Insights appear once medicines are scheduled and doses are recorded.
        </EmptyState>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <UpcomingAppointments report={report} />
        <Incidents report={report} />
      </div>

      <Card id="data-used">
        <CardHeader title="Data used" icon={<Database />} as="h3" />
        <ul className="list-disc space-y-1.5 pl-5 text-[0.95rem] text-stone-600 marker:text-stone-300">
          {report.dataUsed.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

const INSIGHT_ICON: Record<Insight["tone"], ReactNode> = {
  positive: <CircleCheck className="text-emerald-700" aria-hidden="true" />,
  neutral: <Info className="text-stone-500" aria-hidden="true" />,
  attention: <TriangleAlert className="text-amber-700" aria-hidden="true" />,
};

function InsightList({ insights }: { insights: Insight[] }) {
  return (
    <ul className="space-y-3">
      {insights.map((insight) => (
        <li key={insight.id} className="flex gap-3 text-[1.05rem] leading-relaxed text-stone-800 [&_svg]:mt-1 [&_svg]:size-5 [&_svg]:shrink-0">
          {INSIGHT_ICON[insight.tone]}
          <span>{insight.text}</span>
        </li>
      ))}
    </ul>
  );
}

function Tile({ label, value, detail, valueClassName, extra }: { label: string; value: string; detail: string; valueClassName?: string; extra?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-soft">
      <p className="text-[0.95rem] font-medium text-stone-500">{label}</p>
      <p className={cn("mt-1 text-4xl font-semibold tracking-tight tabular-nums text-stone-900", valueClassName)}>{value}</p>
      <p className="mt-1 text-sm text-stone-600">{detail}</p>
      {extra}
    </div>
  );
}

function KpiTiles({ report }: { report: InsightsReport }) {
  const s = report.week.summary;
  const change = report.change;
  const trend =
    change === null ? null : (
      <p
        className={cn(
          "mt-2 flex items-start gap-1 text-sm font-medium [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0",
          change > 0 ? "text-emerald-800" : change < 0 ? "text-red-700" : "text-stone-600",
        )}
      >
        {change > 0 ? <TrendingUp aria-hidden="true" /> : change < 0 ? <TrendingDown aria-hidden="true" /> : <Minus aria-hidden="true" />}
        {change === 0 ? "Same as the week before" : `${Math.abs(change)} ${Math.abs(change) === 1 ? "point" : "points"} ${change > 0 ? "up" : "down"} on the week before`}
      </p>
    );
  return (
    <section aria-label="This week in numbers" className="grid grid-cols-2 gap-4 lg:grid-cols-3">
      <Tile
        label="Weekly adherence"
        value={formatRate(s.rate)}
        valueClassName={rateTone(s.rate)}
        detail={s.total ? `${s.taken} of ${s.total} counted doses taken` : "No doses counted yet"}
        extra={trend}
      />
      <Tile label="Taken" value={String(s.taken)} detail="Confirmed by someone" valueClassName="text-emerald-700" />
      <Tile label="Missed" value={String(s.missed)} detail="Recorded as not taken" valueClassName={s.missed ? "text-red-700" : undefined} />
      <Tile label="Unconfirmed" value={String(s.unconfirmed)} detail="Nobody recorded it in time" valueClassName={s.unconfirmed ? "text-orange-800" : undefined} />
      <Tile label="Skipped" value={String(s.skipped)} detail="Skipped on purpose" />
      <Tile label="Pending now" value={String(report.pendingNow)} detail="Due and waiting to be confirmed" valueClassName={report.pendingNow ? "text-amber-700" : undefined} />
    </section>
  );
}

function FrequentlyMissed({ report }: { report: InsightsReport }) {
  return (
    <Card>
      <CardHeader
        title="Frequently missed doses"
        icon={<TriangleAlert />}
        as="h3"
        description={`${periodLabel(report.patterns.from, report.patterns.to)} · missed or unconfirmed`}
      />
      {report.frequentlyMissed.length ? (
        <ul className="divide-y divide-stone-100">
          {report.frequentlyMissed.map((row) => (
            <li key={row.key} className="space-y-2 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium text-stone-900">
                  {row.name}
                  {row.dosage ? <span className="font-normal text-stone-500"> {row.dosage}</span> : null}
                  <span className="font-normal text-stone-500"> · {row.timeLabel}</span>
                </p>
                <p className="text-sm font-semibold tabular-nums text-red-700">
                  {row.notTaken} of {row.counted} not taken
                </p>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-stone-100" aria-hidden="true">
                <div className="h-full rounded-full bg-red-500" style={{ width: `${(row.notTaken / row.counted) * 100}%` }} />
              </div>
              <p className="text-sm text-stone-500">
                {row.missed} missed · {row.unconfirmed} unconfirmed
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-stone-500">No doses were missed or left unconfirmed in the last 4 weeks.</p>
      )}
    </Card>
  );
}

function GroupBars({ title, groups }: { title: string; groups: PatternGroup[] }) {
  const shown = groups.filter((group) => group.counted > 0);
  if (!shown.length) return null;
  return (
    <div>
      <h4 className="mb-2 text-sm font-medium text-stone-500">{title}</h4>
      <ul className="space-y-2">
        {shown.map((group) => (
          <li key={group.key} className="grid grid-cols-[6.5rem_minmax(0,1fr)_5.5rem] items-center gap-3 text-sm">
            <span className="text-stone-700">{group.label}</span>
            <span className="h-2 w-full overflow-hidden rounded-full bg-stone-100" aria-hidden="true">
              <span className="block h-full rounded-full bg-orange-400" style={{ width: `${group.rate ?? 0}%` }} />
            </span>
            <span className="text-right tabular-nums text-stone-600">
              {group.notTaken} of {group.counted}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Patterns({ report }: { report: InsightsReport }) {
  const { patterns } = report;
  return (
    <Card>
      <CardHeader
        title="Recurring patterns"
        icon={<Repeat />}
        as="h3"
        description={`${periodLabel(patterns.from, patterns.to)} · doses missed or left unconfirmed`}
      />
      <div className="space-y-5">
        {patterns.findings.length ? (
          <ul className="space-y-2">
            {patterns.findings.map((finding) => (
              <li key={finding.kind} className="rounded-xl border border-amber-200/80 bg-amber-50/70 px-4 py-3 text-[0.95rem] text-amber-950">
                {finding.text}
              </li>
            ))}
          </ul>
        ) : null}
        <p className="text-[0.95rem] text-stone-600">{patterns.note}</p>
        {patterns.notTaken ? (
          <>
            <GroupBars title="By time of day" groups={patterns.byDayPart} />
            <GroupBars title="By day of the week" groups={patterns.byWeekday} />
          </>
        ) : null}
      </div>
    </Card>
  );
}

function MedicineTable({ report }: { report: InsightsReport }) {
  if (!report.medications.length) return null;
  return (
    <Card>
      <CardHeader title="By medicine" icon={<Pill />} as="h3" description="Adherence this week and over the last 4 weeks." />
      <div className="relative -mx-5 overflow-x-auto px-5 sm:-mx-6 sm:px-6">
        <table className="w-full min-w-lg text-left text-[0.95rem]">
          <thead>
            <tr className="border-b border-stone-200 text-sm text-stone-500">
              <th scope="col" className="pb-2 pr-2 font-medium">
                Medicine
              </th>
              <th scope="col" className="pb-2 pr-2 text-right font-medium">
                This week
              </th>
              <th scope="col" className="pb-2 pr-2 text-right font-medium">
                Missed
              </th>
              <th scope="col" className="pb-2 pr-2 text-right font-medium">
                Unconfirmed
              </th>
              <th scope="col" className="pb-2 pr-2 text-right font-medium">
                Skipped
              </th>
              <th scope="col" className="pb-2 text-right font-medium">
                4 weeks
              </th>
            </tr>
          </thead>
          <tbody>
            {report.medications.map((row) => (
              <tr key={row.medicationId} className="border-b border-stone-100 last:border-0">
                <th scope="row" className="py-3 pr-2 font-medium text-stone-900">
                  {row.name}
                  {row.dosage ? <span className="font-normal text-stone-500"> {row.dosage}</span> : null}
                </th>
                <td className={cn("py-3 pr-2 text-right font-semibold tabular-nums", rateTone(row.week.rate))}>
                  {formatRate(row.week.rate)}
                  <span className="block text-xs font-normal text-stone-500">
                    {row.week.taken} of {row.week.total}
                  </span>
                </td>
                <td className="py-3 pr-2 text-right tabular-nums text-stone-600">{row.week.missed}</td>
                <td className="py-3 pr-2 text-right tabular-nums text-stone-600">{row.week.unconfirmed}</td>
                <td className="py-3 pr-2 text-right tabular-nums text-stone-600">{row.week.skipped}</td>
                <td className={cn("py-3 text-right font-semibold tabular-nums", rateTone(row.month.rate))}>
                  {formatRate(row.month.rate)}
                  <span className="block text-xs font-normal text-stone-500">
                    {row.month.taken} of {row.month.total}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function UpcomingAppointments({ report }: { report: InsightsReport }) {
  return (
    <Card>
      <CardHeader title="Upcoming appointments" icon={<Stethoscope />} as="h3" description="Doctor visits in the next 7 days." />
      {report.upcomingAppointments.length ? (
        <ul className="space-y-3">
          {report.upcomingAppointments.map((visit) => (
            <li key={visit.id} className="rounded-xl border border-stone-200/80 p-4">
              <p className="text-sm font-medium text-teal-800">{formatInstant(new Date(visit.dateTime), report.timezone)}</p>
              <p className="mt-1 font-semibold tracking-tight text-stone-900">{visit.doctorName}</p>
              {visit.specialty ? <p className="text-[0.95rem] text-stone-500">{visit.specialty}</p> : null}
              {visit.location ? (
                <p className="mt-2 flex items-start gap-1.5 text-sm text-stone-500">
                  <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" /> {visit.location}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-stone-500">No doctor appointments in the next 7 days.</p>
      )}
    </Card>
  );
}

const ALERT_TONE: Record<AlertStatus, Tone> = { open: "error", acknowledged: "warning", resolved: "success" };

function incidentLines(incident: IncidentRow): string[] {
  const lines: string[] = [];
  lines.push(incident.notifiedNames.length ? `Alerted: ${incident.notifiedNames.join(", ")}` : "Shown in the app (nobody had email alerts on)");
  if (incident.widened) lines.push("Nobody responded in time, so the rest of the circle was alerted too");
  if (incident.acknowledgedByName) {
    lines.push(
      `Acknowledged by ${incident.acknowledgedByName}${incident.minutesToAcknowledge !== null ? ` after ${incident.minutesToAcknowledge} ${incident.minutesToAcknowledge === 1 ? "minute" : "minutes"}` : ""}`,
    );
  }
  if (incident.resolvedByName) {
    lines.push(`Closed${incident.resolution ? ` as ${incident.resolution}` : ""} by ${incident.resolvedByName}`);
  }
  return lines;
}

function Incidents({ report }: { report: InsightsReport }) {
  return (
    <Card>
      <CardHeader
        title="Recent escalations"
        icon={<Siren />}
        as="h3"
        description="This week’s doses that nobody confirmed in time, and who followed up."
      />
      {report.incidents.length ? (
        <ul className="divide-y divide-stone-100">
          {report.incidents.map((incident) => (
            <li key={incident.id} className="space-y-1.5 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-stone-900">
                  {incident.dateLabel} · {incident.timeLabel}
                </p>
                <Badge tone={ALERT_TONE[incident.status]} dot>
                  {ALERT_STATUS_LABELS[incident.status]}
                </Badge>
              </div>
              <p className="text-[0.95rem] text-stone-700">{incident.medicines.join(", ")}</p>
              <ul className="space-y-0.5 text-sm text-stone-500">
                {incidentLines(incident).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-stone-500">No escalations this week.</p>
      )}
    </Card>
  );
}
