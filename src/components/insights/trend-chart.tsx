import { DOSE_STATUS_LABELS } from "@/lib/constants";
import type { DayTrend } from "@/lib/insights-core";
import { cn } from "@/lib/utils";
import { STATUS_FILL } from "./status-colors";

const SEGMENTS = ["taken", "skipped", "missed", "unconfirmed", "pending", "upcoming"] as const;
const BAR_REM = 9;

function count(day: DayTrend, status: (typeof SEGMENTS)[number]): number {
  return status === "upcoming" ? day.upcoming : day.summary[status];
}

/**
 * Seven stacked bars, one per day (taken at the bottom). Bar height follows how many doses were
 * scheduled; the label above is the share of counted doses that were taken. Screen readers get the
 * same numbers as a table.
 */
export function TrendChart({ days }: { days: DayTrend[] }) {
  const most = Math.max(1, ...days.map((day) => day.scheduled));

  return (
    <figure>
      <div aria-hidden="true" className="flex items-end gap-1.5 sm:gap-3">
        {days.map((day) => (
          <div key={day.date} className="flex min-w-0 flex-1 flex-col items-center gap-2">
            <span
              className={cn(
                "text-xs font-semibold tabular-nums sm:text-sm",
                day.summary.rate === null ? "text-stone-500" : day.summary.rate >= 90 ? "text-emerald-800" : day.summary.rate >= 70 ? "text-amber-800" : "text-red-700",
              )}
            >
              {day.summary.rate === null ? "–" : `${day.summary.rate}%`}
            </span>
            <div className="flex w-full max-w-14 items-end justify-center" style={{ height: `${BAR_REM}rem` }}>
              {day.scheduled ? (
                <div
                  className="flex w-full flex-col-reverse overflow-hidden rounded-lg ring-1 ring-inset ring-stone-200"
                  style={{ height: `${(day.scheduled / most) * BAR_REM}rem` }}
                >
                  {SEGMENTS.map((status) =>
                    count(day, status) ? (
                      <div key={status} className={STATUS_FILL[status]} style={{ height: `${(count(day, status) / day.scheduled) * 100}%` }} />
                    ) : null,
                  )}
                </div>
              ) : (
                <div className="h-2 w-full rounded-full border border-dashed border-stone-300" />
              )}
            </div>
            <span className="text-sm font-medium text-stone-600">{day.weekday}</span>
          </div>
        ))}
      </div>
      <figcaption className="mt-4 text-sm text-stone-500">
        Bar height shows how many doses were scheduled each day. The percentage is the share of counted doses that were taken.
      </figcaption>
      {/* sr-only goes on a wrapper: a table ignores width: 1px and would widen the page. */}
      <div className="sr-only">
        <table>
          <caption>Doses per day</caption>
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col">Taken</th>
              <th scope="col">Skipped</th>
              <th scope="col">Missed</th>
              <th scope="col">Unconfirmed</th>
              <th scope="col">{DOSE_STATUS_LABELS.pending}</th>
              <th scope="col">Upcoming</th>
              <th scope="col">Adherence</th>
            </tr>
          </thead>
          <tbody>
            {days.map((day) => (
              <tr key={day.date}>
                <th scope="row">{day.label}</th>
                <td>{day.summary.taken}</td>
                <td>{day.summary.skipped}</td>
                <td>{day.summary.missed}</td>
                <td>{day.summary.unconfirmed}</td>
                <td>{day.summary.pending}</td>
                <td>{day.upcoming}</td>
                <td>{day.summary.rate === null ? "No doses counted" : `${day.summary.rate}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
