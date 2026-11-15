"use client";

import { useId } from "react";
import { APP_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * The Saathi mark: two capsules that together form a check mark. A medicine, and someone making
 * sure it was taken. Each instance gets its own gradient ids, so several logos can share a page.
 */
export function LogoMark({ className }: { className?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const ref = (name: string) => `${name}-${id}`;
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={cn("size-8 shrink-0", className)}>
      <defs>
        <linearGradient id={ref("bg")} x1="6" y1="0" x2="58" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#14b8a6" />
          <stop offset="0.5" stopColor="#0f766e" />
          <stop offset="1" stopColor="#134e4a" />
        </linearGradient>
        <radialGradient id={ref("gloss")} cx="18" cy="2" r="40" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff" stopOpacity="0.24" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={ref("pill")} x1="28.5" y1="44" x2="46.5" y2="21.5" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ccfbf1" />
          <stop offset="0.5" stopColor="#ccfbf1" />
          <stop offset="0.5" stopColor="#fff" />
          <stop offset="1" stopColor="#fff" />
        </linearGradient>
        <mask id={ref("seam")} maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64">
          <rect width="64" height="64" fill="#fff" />
          <line x1="28.5" y1="44" x2="46.5" y2="21.5" stroke="#000" strokeWidth="13.5" strokeLinecap="round" />
        </mask>
        <filter id={ref("lift")} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1.2" stdDeviation="1.2" floodColor="#042f2e" floodOpacity="0.35" />
        </filter>
      </defs>
      <rect width="64" height="64" rx="15" fill={`url(#${ref("bg")})`} />
      <rect width="64" height="64" rx="15" fill={`url(#${ref("gloss")})`} />
      <rect x="0.5" y="0.5" width="63" height="63" rx="14.5" fill="none" stroke="#fff" strokeOpacity="0.14" />
      <g filter={`url(#${ref("lift")})`}>
        <line
          x1="17.5"
          y1="33.5"
          x2="28.5"
          y2="44"
          stroke="#5eead4"
          strokeWidth="9.5"
          strokeLinecap="round"
          mask={`url(#${ref("seam")})`}
        />
        <line x1="28.5" y1="44" x2="46.5" y2="21.5" stroke={`url(#${ref("pill")})`} strokeWidth="9.5" strokeLinecap="round" />
      </g>
    </svg>
  );
}

export function Logo({ className, markClassName }: { className?: string; markClassName?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2.5 text-[1.15rem] font-semibold tracking-[-0.025em] text-stone-900",
        className,
      )}
    >
      <LogoMark className={markClassName} />
      {APP_NAME}
    </span>
  );
}
