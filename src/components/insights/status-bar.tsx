import { DOSE_STATUS_LABELS } from "@/lib/constants";
import type { AdherenceSummary } from "@/lib/schedule";
import { cn } from "@/lib/utils";
import { STATUS_FILL } from "./status-colors";

const COUNTED = ["taken", "skipped", "missed", "unconfirmed"] as const;

/** Taken vs skipped vs missed vs unconfirmed for the week, as one stacked bar with a counted legend. */
export function StatusBar({ summary }: { summary: AdherenceSummary }) {
  const pct = (value: number) => `${(value / summary.total) * 100}%`;
  return (
    <div className="space-y-4">
      {summary.total ? (
        <div className="flex h-4 w-full gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
          {COUNTED.map((status) =>
            summary[status] ? <div key={status} className={cn("rounded-full", STATUS_FILL[status])} style={{ width: pct(summary[status]) }} /> : null,
          )}
        </div>
      ) : (
        <div className="h-4 w-full rounded-full bg-stone-100" aria-hidden="true" />
      )}
      <ul className="grid grid-cols-2 gap-x-6 gap-y-2" aria-label="Doses this week by status">
        {COUNTED.map((status) => (
          <li key={status} className="flex items-center gap-2">
            <span className={cn("size-3 shrink-0 rounded-full", STATUS_FILL[status])} aria-hidden="true" />
            <span className="text-stone-600">{DOSE_STATUS_LABELS[status]}</span>
            <span className="ml-auto font-semibold tabular-nums text-stone-900">{summary[status]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
