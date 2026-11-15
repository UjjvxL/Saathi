"use client";

import { useEffect, useRef } from "react";

/** A soft teal light that follows the mouse across its parent section (decorative, mouse only). */
export function PointerGlow() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const glow = ref.current;
    const area = glow?.parentElement;
    if (!glow || !area) return;
    const move = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const box = area.getBoundingClientRect();
      glow.style.setProperty("--glow-x", `${event.clientX - box.left}px`);
      glow.style.setProperty("--glow-y", `${event.clientY - box.top}px`);
      glow.style.opacity = "1";
    };
    const leave = () => {
      glow.style.opacity = "0";
    };
    area.addEventListener("pointermove", move, { passive: true });
    area.addEventListener("pointerleave", leave);
    return () => {
      area.removeEventListener("pointermove", move);
      area.removeEventListener("pointerleave", leave);
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-700 [background:radial-gradient(560px_circle_at_var(--glow-x)_var(--glow-y),rgba(20,184,166,0.16),transparent_60%)]"
    />
  );
}
