"use client";

import { motion, useScroll, useSpring } from "motion/react";

/** A thin bar under the header that fills as you read down the page. */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 140, damping: 30, mass: 0.4 });
  return (
    <motion.div
      aria-hidden="true"
      style={{ scaleX }}
      className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-linear-to-r from-teal-500 via-emerald-500 to-teal-700"
    />
  );
}
