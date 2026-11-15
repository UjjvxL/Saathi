import type { DoseStatus } from "@/lib/constants";

/** One colour per dose status, shared by the insights charts (always shown with a text label too). */
export const STATUS_FILL: Record<DoseStatus, string> = {
  taken: "bg-emerald-500",
  skipped: "bg-stone-300",
  missed: "bg-red-500",
  unconfirmed: "bg-orange-400",
  pending: "bg-amber-300",
  upcoming: "bg-stone-100",
};
