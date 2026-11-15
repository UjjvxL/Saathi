import { APP_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("size-8", className)}>
      <rect width="32" height="32" rx="9" fill="#0f766e" />
      <path
        d="M16 24.5s-7.5-4.6-7.5-10.1A4.2 4.2 0 0 1 16 12a4.2 4.2 0 0 1 7.5 2.4c0 5.5-7.5 10.1-7.5 10.1Z"
        fill="#fff"
      />
      <path
        d="M11.5 16.2h2.6l1.3-2.4 1.9 4.6 1.3-2.2h2.1"
        fill="none"
        stroke="#0f766e"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 text-lg font-semibold tracking-tight text-stone-900", className)}>
      <LogoMark />
      {APP_NAME}
    </span>
  );
}
