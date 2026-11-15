"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * The hero's 3D capsule. A CSS capsule shows straight away; three.js is loaded afterwards and the
 * 3D scene fades in over it. Without WebGL (or if it fails) the CSS capsule simply stays.
 * It fills its positioned parent.
 */
export function CapsuleScene({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let stop: (() => void) | undefined;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    import("./capsule-three")
      .then(({ mountCapsuleScene }) => {
        if (cancelled || !ref.current) return;
        stop = mountCapsuleScene(ref.current, { reducedMotion, onReady: () => setReady(true) });
      })
      .catch((error) => console.warn("[capsule] 3D scene unavailable, showing the flat capsule", error));
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      data-cursor-label="Spin me"
      className={cn("absolute inset-0 cursor-grab touch-pan-y select-none active:cursor-grabbing", className)}
    >
      {/* Soft shadow on the "floor". */}
      <div className="pointer-events-none absolute bottom-[8%] left-1/2 h-10 w-3/5 -translate-x-1/2 rounded-[50%] bg-teal-950/25 blur-2xl" />
      {/* Instant fallback, replaced by the 3D scene once it's ready. */}
      <div
        className={cn(
          "pointer-events-none absolute inset-0 flex items-center justify-center transition-opacity duration-700",
          ready ? "opacity-0" : "opacity-100",
        )}
      >
        <div className="flex h-[22%] w-[62%] -rotate-[42deg] overflow-hidden rounded-full shadow-[0_30px_60px_-20px_rgba(19,78,74,0.55)]">
          <div className="w-[46%] bg-linear-to-b from-teal-400 via-teal-600 to-teal-800" />
          <div className="w-[54%] bg-linear-to-b from-white via-stone-100 to-stone-300" />
        </div>
      </div>
    </div>
  );
}
