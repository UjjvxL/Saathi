"use client";

import { AnimatePresence, motion, useMotionValue, useSpring } from "motion/react";
import { useEffect, useState, useSyncExternalStore } from "react";

type Mode = "default" | "interactive" | "text" | "label";

const QUERY = "(pointer: fine) and (prefers-reduced-motion: no-preference)";
const INTERACTIVE = "a, button, summary, label, select, [role='button'], [data-cursor='interactive']";
const TEXT_INPUT = "input:not([type='checkbox']):not([type='radio']), textarea";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * A soft ring that follows the mouse with a little spring, plus a precise dot. It grows over anything
 * clickable and can show a short label (`data-cursor-label`). The normal pointer stays visible (better
 * for older eyes and system cursor settings); touch screens and reduced-motion users get nothing extra.
 */
export function CursorEffect() {
  const enabled = useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => false);
  return enabled ? <Cursor /> : null;
}

function Cursor() {
  const [visible, setVisible] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [mode, setMode] = useState<Mode>("default");
  const [label, setLabel] = useState("");
  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const ringX = useSpring(x, { stiffness: 420, damping: 32, mass: 0.6 });
  const ringY = useSpring(y, { stiffness: 420, damping: 32, mass: 0.6 });

  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      x.set(event.clientX);
      y.set(event.clientY);
      setVisible(true);
    };
    const over = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const labelled = target?.closest<HTMLElement>("[data-cursor-label]");
      if (labelled) {
        setMode("label");
        setLabel(labelled.dataset.cursorLabel ?? "");
      } else if (target?.closest(TEXT_INPUT)) setMode("text");
      else if (target?.closest(INTERACTIVE)) setMode("interactive");
      else setMode("default");
    };
    const down = () => setPressed(true);
    const up = () => setPressed(false);
    const leave = () => setVisible(false);

    window.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerover", over, { passive: true });
    window.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);
    document.documentElement.addEventListener("pointerleave", leave);
    return () => {
      window.removeEventListener("pointermove", move);
      document.removeEventListener("pointerover", over);
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
      document.documentElement.removeEventListener("pointerleave", leave);
    };
  }, [x, y]);

  const size = mode === "label" ? 84 : mode === "interactive" ? 54 : mode === "text" ? 0 : 34;
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[100]">
      <motion.div
        className="absolute left-0 top-0 flex items-center justify-center rounded-full border"
        style={{ x: ringX, y: ringY, translateX: "-50%", translateY: "-50%" }}
        animate={{
          width: size,
          height: size,
          opacity: visible && mode !== "text" ? 1 : 0,
          scale: pressed ? 0.82 : 1,
          backgroundColor: mode === "default" ? "rgba(20,184,166,0)" : mode === "label" ? "rgba(15,118,110,0.92)" : "rgba(20,184,166,0.12)",
          borderColor: mode === "default" ? "rgba(15,118,110,0.45)" : mode === "label" ? "rgba(15,118,110,0)" : "rgba(15,118,110,0.25)",
        }}
        transition={{ type: "spring", stiffness: 380, damping: 28, mass: 0.6 }}
      >
        <AnimatePresence>
          {mode === "label" && label ? (
            <motion.span
              key={label}
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              className="whitespace-nowrap text-[0.7rem] font-semibold uppercase tracking-wider text-white"
            >
              {label}
            </motion.span>
          ) : null}
        </AnimatePresence>
      </motion.div>
      <motion.div
        className="absolute left-0 top-0 size-1.5 rounded-full bg-teal-700"
        style={{ x, y, translateX: "-50%", translateY: "-50%" }}
        animate={{ opacity: visible && mode === "default" ? 1 : 0 }}
        transition={{ duration: 0.15 }}
      />
    </div>
  );
}
