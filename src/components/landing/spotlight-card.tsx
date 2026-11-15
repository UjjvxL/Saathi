"use client";

import { motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import { useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A card (list item) with a soft light that follows the mouse and a gentle 3D tilt. The content sits
 * above the light, so text contrast never changes.
 */
export function SpotlightCard({
  children,
  className,
  glow = "rgba(20,184,166,0.13)",
}: {
  children: ReactNode;
  className?: string;
  glow?: string;
}) {
  const ref = useRef<HTMLLIElement>(null);
  const reduce = useReducedMotion();
  const mouseX = useMotionValue(-500);
  const mouseY = useMotionValue(-500);
  const rotateX = useSpring(0, { stiffness: 180, damping: 18 });
  const rotateY = useSpring(0, { stiffness: 180, damping: 18 });
  const background = useMotionTemplate`radial-gradient(460px circle at ${mouseX}px ${mouseY}px, ${glow}, transparent 45%)`;

  return (
    <motion.li
      ref={ref}
      className={cn("group relative", className)}
      style={reduce ? undefined : { rotateX, rotateY, transformPerspective: 1100 }}
      onPointerMove={(event) => {
        if (event.pointerType !== "mouse" || !ref.current) return;
        const box = ref.current.getBoundingClientRect();
        mouseX.set(event.clientX - box.left);
        mouseY.set(event.clientY - box.top);
        if (!reduce) {
          rotateY.set(((event.clientX - box.left) / box.width - 0.5) * 5);
          rotateX.set(-((event.clientY - box.top) / box.height - 0.5) * 5);
        }
      }}
      onPointerLeave={() => {
        rotateX.set(0);
        rotateY.set(0);
        mouseX.set(-500);
        mouseY.set(-500);
      }}
    >
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background }}
      />
      <div className="relative flex h-full flex-col">{children}</div>
    </motion.li>
  );
}
