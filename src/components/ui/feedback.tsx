import type { ReactNode } from "react";
import { cn, initials } from "@/lib/utils";

export type Tone = "info" | "success" | "warning" | "error" | "neutral";

const NOTICE_TONES: Record<Tone, string> = {
  info: "border-sky-200/80 bg-sky-50/70 text-sky-950",
  success: "border-emerald-200/80 bg-emerald-50/70 text-emerald-950",
  warning: "border-amber-200/80 bg-amber-50/70 text-amber-950",
  error: "border-red-200/80 bg-red-50/70 text-red-950",
  neutral: "border-stone-200 bg-stone-50 text-stone-800",
};

export function Notice({
  tone = "info",
  title,
  icon,
  children,
  className,
}: {
  tone?: Tone;
  title?: string;
  icon?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex gap-3 rounded-xl border px-4 py-3 text-[0.95rem] [&_svg]:mt-0.5 [&_svg]:size-[1.1rem] [&_svg]:shrink-0",
        NOTICE_TONES[tone],
        className,
      )}
    >
      {icon}
      <div className="min-w-0 space-y-0.5">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div>{children}</div> : null}
      </div>
    </div>
  );
}

const BADGE_TONES: Record<Tone, string> = {
  info: "bg-sky-50 text-sky-800 ring-sky-600/20",
  success: "bg-emerald-50 text-emerald-800 ring-emerald-600/20",
  warning: "bg-amber-50 text-amber-800 ring-amber-600/25",
  error: "bg-red-50 text-red-700 ring-red-600/20",
  neutral: "bg-stone-100 text-stone-700 ring-stone-500/20",
};

const DOT_TONES: Record<Tone, string> = {
  info: "bg-sky-500",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  error: "bg-red-500",
  neutral: "bg-stone-400",
};

export function Badge({
  tone = "neutral",
  dot = false,
  children,
  className,
}: {
  tone?: Tone;
  dot?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-sm font-medium ring-1 ring-inset [&_svg]:size-3.5",
        BADGE_TONES[tone],
        className,
      )}
    >
      {dot ? <span aria-hidden="true" className={cn("size-1.5 rounded-full", DOT_TONES[tone])} /> : null}
      {children}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-xl bg-stone-200/60", className)} />;
}

export function LoadingCards({ count = 3, label = "Loading" }: { count?: number; label?: string }) {
  return (
    <div className="space-y-4" role="status" aria-label={label}>
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} className="h-28 w-full rounded-2xl" />
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  actions,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-stone-300 bg-white/60 px-6 py-12 text-center">
      {icon ? (
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-stone-100 text-stone-700 [&_svg]:size-6">
          {icon}
        </div>
      ) : null}
      <h3 className="text-lg font-semibold tracking-tight text-stone-900">{title}</h3>
      {children ? <div className="mx-auto mt-1.5 max-w-md text-stone-600">{children}</div> : null}
      {actions ? <div className="mt-6 flex flex-wrap justify-center gap-3">{actions}</div> : null}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  as: Heading = "h1",
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  as?: "h1" | "h2";
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <Heading
          className={cn(
            "font-semibold tracking-tight text-stone-900",
            Heading === "h1" ? "text-3xl sm:text-4xl" : "text-2xl sm:text-[1.75rem]",
          )}
        >
          {title}
        </Heading>
        {description ? <div className="mt-1.5 max-w-2xl text-stone-600">{description}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      className="h-2 w-full overflow-hidden rounded-full bg-stone-100"
    >
      <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-500" style={{ width: `${clamped}%` }} />
    </div>
  );
}

const AVATAR_TINTS = [
  "bg-teal-50 text-teal-800 ring-teal-200/70",
  "bg-sky-50 text-sky-800 ring-sky-200/70",
  "bg-amber-50 text-amber-800 ring-amber-200/70",
  "bg-rose-50 text-rose-800 ring-rose-200/70",
  "bg-violet-50 text-violet-800 ring-violet-200/70",
  "bg-lime-50 text-lime-800 ring-lime-200/70",
];

const AVATAR_SIZES = {
  sm: "size-9 text-sm",
  md: "size-11 text-base",
  lg: "size-14 text-lg",
};

/** Initials avatar with a calm colour picked consistently from the name. */
export function Avatar({ name, size = "md", className }: { name: string; size?: keyof typeof AVATAR_SIZES; className?: string }) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold ring-1 ring-inset",
        AVATAR_TINTS[hash % AVATAR_TINTS.length],
        AVATAR_SIZES[size],
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
