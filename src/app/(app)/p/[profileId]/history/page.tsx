import { Activity as ActivityIcon, CalendarDays, Pill, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge, LoadingCards } from "@/components/ui/feedback";
import { requireMemberContext } from "@/lib/auth/dal";
import { getActivity, getHistory } from "@/lib/data";
import { formatInstant, formatLocalDate, formatTime12h, type AdherenceSummary } from "@/lib/schedule";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "History" };

const RANGES = [7, 30] as const;

export default function HistoryPage({ params, searchParams }: PageProps<"/p/[profileId]/history">) {
  return (
    <Suspense fallback={<LoadingCards count={3} label="Loading history" />}>
      <HistoryView params={params} searchParams={searchParams} />
    </Suspense>
  );
}

function rateTone(rate: number | null): string {
  if (rate === null) return "text-stone-500";
  if (rate >= 90) return "text-emerald-700";
  if (rate >= 70) return "text-amber-700";
  return "text-red-700";
}

function describe(summary: AdherenceSummary): string {
  if (!summary.total) return "No doses";
  return [
    `${summary.taken} taken`,
    summary.skipped ? `${summary.skipped} skipped` : null,
    summary.missed ? `${summary.missed} missed` : null,
    summary.unconfirmed ? `${summary.unconfirmed} unconfirmed` : null,
  ]
    .filter(Boolean)
    .join(", ");
}

function StackedBar({ summary }: { summary: AdherenceSummary }) {
  if (!summary.total) return <div className="h-2.5 w-full rounded-full bg-stone-100" aria-hidden="true" />;
  const pct = (value: number) => `${(value / summary.total) * 100}%`;
  return (
    <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
      {summary.taken ? <div className="rounded-full bg-emerald-500" style={{ width: pct(summary.taken) }} /> : null}
      {summary.skipped ? <div className="rounded-full bg-stone-300" style={{ width: pct(summary.skipped) }} /> : null}
      {summary.missed ? <div className="rounded-full bg-red-500" style={{ width: pct(summary.missed) }} /> : null}
      {summary.unconfirmed ? (
        <div className="rounded-full bg-orange-400" style={{ width: pct(summary.unconfirmed) }} />
      ) : null}
    </div>
  );
}

const LEGEND = [
  { label: "Taken", className: "bg-emerald-500" },
  { label: "Skipped", className: "bg-stone-300" },
  { label: "Missed", className: "bg-red-500" },
  { label: "Unconfirmed", className: "bg-orange-400" },
];

async function HistoryView({
  params,
  searchParams,
}: {
  params: Promise<{ profileId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ profileId }, query] = await Promise.all([params, searchParams]);
  const days = query.days === "30" ? 30 : 7;
  const { profile } = await requireMemberContext(profileId);
  const [report, activity] = await Promise.all([getHistory(profile, days), getActivity(profile.id)]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Medicine history</h2>
          <p className="text-stone-500">
            {formatLocalDate(report.from, true)} – {formatLocalDate(report.to, true)}
          </p>
        </div>
        <nav aria-label="Time range" className="inline-flex rounded-full border border-stone-200 bg-white p-1 shadow-xs">
          {RANGES.map((range) => (
            <Link
              key={range}
              href={`/p/${profile.id}/history?days=${range}`}
              aria-current={days === range ? "page" : undefined}
              className={cn(
                "flex h-10 items-center rounded-full px-4 text-sm font-medium transition-colors",
                days === range ? "bg-stone-900 text-white" : "text-stone-600 hover:text-stone-900",
              )}
            >
              Last {range} days
            </Link>
          ))}
        </nav>
      </div>

      <div className="grid gap-6 md:grid-cols-[15rem_minmax(0,1fr)]">
        <Card className="flex flex-col justify-between gap-6">
          <div>
            <p className="text-[0.95rem] font-medium text-stone-500">Doses taken</p>
            <p className={cn("mt-2 text-6xl font-semibold tracking-tight", rateTone(report.overall.rate))}>
              {report.overall.rate === null ? "–" : `${report.overall.rate}%`}
            </p>
            <p className="mt-2 text-stone-600">{describe(report.overall)}</p>
          </div>
          <ul className="space-y-1.5 text-sm text-stone-600" aria-label="Legend">
            {LEGEND.map((item) => (
              <li key={item.label} className="flex items-center gap-2">
                <span className={cn("size-2.5 rounded-full", item.className)} aria-hidden="true" /> {item.label}
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Day by day" icon={<CalendarDays />} as="h3" />
          <ul className="space-y-3">
            {[...report.days].reverse().map((day) => (
              <li
                key={day.date}
                className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-x-4 gap-y-1 sm:grid-cols-[7rem_minmax(0,1fr)_10rem]"
              >
                <span className="text-[0.95rem] font-medium text-stone-700">{formatLocalDate(day.date)}</span>
                <StackedBar summary={day.summary} />
                <span className="col-span-2 text-sm text-stone-500 sm:col-span-1 sm:text-right">{describe(day.summary)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="By medicine" icon={<Pill />} as="h3" />
          {report.byMedication.length ? (
            <table className="w-full text-left text-[0.95rem]">
              <thead>
                <tr className="border-b border-stone-200 text-sm text-stone-500">
                  <th scope="col" className="pb-2 pr-2 font-medium">
                    Medicine
                  </th>
                  <th scope="col" className="pb-2 pr-2 text-right font-medium">
                    Taken
                  </th>
                  <th scope="col" className="pb-2 text-right font-medium">
                    Missed
                  </th>
                </tr>
              </thead>
              <tbody>
                {report.byMedication.map((row) => (
                  <tr key={row.medicationId} className="border-b border-stone-100 last:border-0">
                    <td className="py-3 pr-2 font-medium text-stone-900">
                      {row.name}
                      {row.dosage ? <span className="font-normal text-stone-500"> {row.dosage}</span> : null}
                    </td>
                    <td className={cn("py-3 pr-2 text-right font-semibold tabular-nums", rateTone(row.summary.rate))}>
                      {row.summary.rate === null ? "–" : `${row.summary.rate}%`}
                    </td>
                    <td className="py-3 text-right tabular-nums text-stone-600">{row.summary.missed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-stone-500">No doses in this period yet.</p>
          )}
        </Card>

        <Card>
          <CardHeader title="Recently missed" icon={<TriangleAlert />} as="h3" />
          {report.recentMisses.length ? (
            <ul className="divide-y divide-stone-100">
              {report.recentMisses.map((dose) => (
                <li key={dose.key} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <span className="font-medium text-stone-900">
                    {dose.name} <span className="font-normal text-stone-500">{dose.dosage}</span>
                  </span>
                  <span className="text-sm text-stone-500">
                    {formatLocalDate(dose.localDate)} · {formatTime12h(dose.localTime)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-stone-500">No missed doses in this period. Well done.</p>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Activity log"
          icon={<ActivityIcon />}
          as="h3"
          description="Every change by anyone in the care circle, newest first."
        />
        {activity.length ? (
          <ol className="relative space-y-5 before:absolute before:bottom-1 before:left-[0.3125rem] before:top-1 before:w-px before:bg-stone-200">
            {activity.map((entry) => (
              <li key={entry.id} className="relative flex gap-4">
                <span
                  aria-hidden="true"
                  className={cn(
                    "relative mt-1.5 size-2.5 shrink-0 rounded-full ring-4 ring-white",
                    entry.kind === "alert" ? "bg-red-500" : entry.kind === "dose" ? "bg-emerald-500" : "bg-stone-300",
                  )}
                />
                <div className="min-w-0">
                  <p className="text-stone-800">
                    {entry.message}
                    {entry.kind === "alert" ? (
                      <Badge tone="error" className="ml-2 align-middle">
                        Alert
                      </Badge>
                    ) : null}
                  </p>
                  <p className="text-sm text-stone-500">{formatInstant(new Date(entry.createdAt), profile.timezone)}</p>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-stone-500">Nothing yet.</p>
        )}
      </Card>
    </div>
  );
}
