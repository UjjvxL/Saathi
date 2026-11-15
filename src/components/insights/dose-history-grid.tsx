import { Check, CircleDashed, CircleHelp, Clock, SkipForward, X } from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { DOSE_STATUS_LABELS, type DoseStatus } from "@/lib/constants";
import type { DayTrend, DoseHistoryRow } from "@/lib/insights-core";
import { cn } from "@/lib/utils";

const CELL: Record<DoseStatus, { icon: ComponentType<SVGProps<SVGSVGElement>>; className: string }> = {
  taken: { icon: Check, className: "bg-emerald-50 text-emerald-800 ring-emerald-600/20" },
  skipped: { icon: SkipForward, className: "bg-stone-100 text-stone-700 ring-stone-500/20" },
  missed: { icon: X, className: "bg-red-50 text-red-700 ring-red-600/25" },
  unconfirmed: { icon: CircleHelp, className: "bg-orange-50 text-orange-800 ring-orange-600/25" },
  pending: { icon: Clock, className: "bg-amber-50 text-amber-800 ring-amber-600/25" },
  upcoming: { icon: CircleDashed, className: "bg-white text-stone-500 ring-stone-300" },
};

/** Medication history for the week: one row per medicine and time, one cell per day. */
export function DoseHistoryGrid({ rows, days }: { rows: DoseHistoryRow[]; days: DayTrend[] }) {
  return (
    // `relative` keeps the visually hidden labels inside this scroll area (otherwise they widen the page).
    // On phones the table scrolls sideways, so the area is focusable for keyboard users.
    <div
      role="region"
      aria-label="Dose history for the week"
      tabIndex={0}
      className="relative -mx-5 overflow-x-auto rounded-lg px-5 sm:-mx-6 sm:px-6"
    >
      <table className="w-full min-w-xl text-left">
        <caption className="sr-only">Every scheduled dose this week and what was recorded</caption>
        <thead>
          <tr className="text-sm text-stone-500">
            <th scope="col" className="sticky left-0 z-10 bg-white pb-3 pr-3 font-medium">
              Medicine
            </th>
            {days.map((day) => (
              <th key={day.date} scope="col" className="pb-3 text-center font-medium">
                <abbr title={day.label} className="no-underline">
                  {day.weekday}
                </abbr>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-t border-stone-100">
              <th scope="row" className="sticky left-0 z-10 bg-white py-2.5 pr-3 font-normal">
                <span className="block font-medium text-stone-900">
                  {row.name}
                  {row.dosage ? <span className="font-normal text-stone-500"> {row.dosage}</span> : null}
                </span>
                <span className="text-sm text-stone-500">{row.timeLabel}</span>
              </th>
              {row.cells.map((cell) => {
                const day = days.find((entry) => entry.date === cell.date);
                if (!cell.status) {
                  return (
                    <td key={cell.date} className="py-2.5 text-center text-stone-300">
                      <span aria-hidden="true">·</span>
                      <span className="sr-only">Not scheduled on {day?.label}</span>
                    </td>
                  );
                }
                const { icon: Icon, className } = CELL[cell.status];
                return (
                  <td key={cell.date} className="py-2.5 text-center">
                    <span className={cn("inline-flex size-8 items-center justify-center rounded-full ring-1 ring-inset", className)}>
                      <Icon className="size-4" aria-hidden="true" />
                      <span className="sr-only">
                        {day?.label}: {DOSE_STATUS_LABELS[cell.status]}
                      </span>
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-sm text-stone-500 sm:hidden">Swipe sideways to see the whole week.</p>
      <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-stone-600" aria-label="What the symbols mean">
        {(Object.keys(CELL) as DoseStatus[]).map((status) => {
          const { icon: Icon, className } = CELL[status];
          return (
            <li key={status} className="flex items-center gap-1.5">
              <span className={cn("inline-flex size-5 items-center justify-center rounded-full ring-1 ring-inset", className)} aria-hidden="true">
                <Icon className="size-3" />
              </span>
              {DOSE_STATUS_LABELS[status]}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
