"use client";

import { ALargeSmall } from "lucide-react";
import { useSyncExternalStore } from "react";
import { TEXT_SIZE_STORAGE_KEY } from "@/lib/constants";

// The <html data-text-size> attribute is set before first paint by a script in the root layout,
// so the page never flashes at the wrong size. This button just flips and saves it.
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-text-size"] });
  return () => observer.disconnect();
}

const getSnapshot = () => document.documentElement.dataset.textSize === "large";
const getServerSnapshot = () => false;

export function TextSizeToggle() {
  const large = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function toggle() {
    const next = large ? "normal" : "large";
    document.documentElement.dataset.textSize = next;
    try {
      localStorage.setItem(TEXT_SIZE_STORAGE_KEY, next);
    } catch {
      // Private mode or blocked storage: the change still applies for this visit.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={large}
      className="inline-flex h-10 items-center gap-2 rounded-full border border-stone-200 bg-white px-3.5 text-sm font-medium text-stone-700 shadow-xs transition-colors hover:border-stone-300 hover:text-stone-900 aria-pressed:border-stone-900 aria-pressed:bg-stone-900 aria-pressed:text-white"
    >
      <ALargeSmall className="size-4" aria-hidden="true" />
      <span>Bigger text</span>
    </button>
  );
}
