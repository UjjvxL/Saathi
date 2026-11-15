import { cn } from "@/lib/utils";

// Elderly mode uses bigger touch targets than the rest of the app (at least 64px tall) and the same
// colours. Filled variants keep at least 4.5:1 contrast with white text (WCAG AA).
const BASE =
  "inline-flex min-h-16 select-none items-center justify-center gap-3 rounded-2xl px-6 py-3 text-center text-xl font-semibold leading-tight tracking-tight transition-[background-color,border-color,color,transform] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60 [&_svg]:size-7 [&_svg]:shrink-0";

const VARIANTS = {
  primary: "bg-stone-900 text-white hover:bg-stone-800",
  success: "bg-emerald-700 text-white hover:bg-emerald-800",
  teal: "bg-teal-700 text-white hover:bg-teal-800",
  secondary: "border-2 border-stone-300 bg-white text-stone-900 hover:border-stone-500 hover:bg-stone-50",
} as const;

export type ElderButtonVariant = keyof typeof VARIANTS;

export function elderButton(variant: ElderButtonVariant = "primary", className?: string): string {
  return cn(BASE, VARIANTS[variant], className);
}

export const elderCard = "rounded-3xl border border-stone-200/80 bg-white p-5 shadow-soft sm:p-7";
