"use client";

import { AArrowDown, AArrowUp } from "lucide-react";
import { useSyncExternalStore } from "react";
import { applyTextSize, readTextSize, subscribeTextSize, TEXT_SIZE_LABELS, TEXT_SIZES, type TextSize } from "@/lib/text-size";
import { cn } from "@/lib/utils";

const getServerSnapshot = (): TextSize => "normal";

const buttonClass =
  "inline-flex size-14 items-center justify-center rounded-2xl border-2 border-stone-300 bg-white text-stone-900 transition-colors hover:border-stone-500 hover:bg-stone-50 disabled:opacity-40 [&_svg]:size-7";

/** Smaller / bigger text, three steps: normal, large and extra large. Saved for next time. */
export function TextSizeControl({ className }: { className?: string }) {
  const size = useSyncExternalStore(subscribeTextSize, readTextSize, getServerSnapshot);
  const index = TEXT_SIZES.indexOf(size);
  const step = (delta: number) => applyTextSize(TEXT_SIZES[Math.min(TEXT_SIZES.length - 1, Math.max(0, index + delta))]);

  return (
    <div role="group" aria-label="Text size" className={cn("flex items-center gap-2", className)}>
      <button type="button" onClick={() => step(-1)} disabled={index === 0} aria-label="Smaller text" className={buttonClass}>
        <AArrowDown aria-hidden="true" />
      </button>
      <span className="min-w-24 text-center text-base font-medium text-stone-700" aria-live="polite">
        {TEXT_SIZE_LABELS[size]}
      </span>
      <button
        type="button"
        onClick={() => step(1)}
        disabled={index === TEXT_SIZES.length - 1}
        aria-label="Bigger text"
        className={buttonClass}
      >
        <AArrowUp aria-hidden="true" />
      </button>
    </div>
  );
}
