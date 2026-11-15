"use client";

import { ALargeSmall } from "lucide-react";
import { useSyncExternalStore } from "react";
import { applyTextSize, readTextSize, subscribeTextSize } from "@/lib/text-size";

// The <html data-text-size> attribute is set before first paint by a script in the root layout,
// so the page never flashes at the wrong size. This button just flips and saves it.
// "Extra large" (chosen in Elderly mode) also counts as bigger text; pressing it returns to normal.
const getSnapshot = () => readTextSize() !== "normal";
const getServerSnapshot = () => false;

export function TextSizeToggle() {
  const large = useSyncExternalStore(subscribeTextSize, getSnapshot, getServerSnapshot);

  return (
    <button
      type="button"
      onClick={() => applyTextSize(large ? "normal" : "large")}
      aria-pressed={large}
      className="inline-flex h-10 items-center gap-2 rounded-full border border-stone-200 bg-white px-3.5 text-sm font-medium text-stone-700 shadow-xs transition-colors hover:border-stone-300 hover:text-stone-900 aria-pressed:border-stone-900 aria-pressed:bg-stone-900 aria-pressed:text-white"
    >
      <ALargeSmall className="size-4" aria-hidden="true" />
      <span>Bigger text</span>
    </button>
  );
}
