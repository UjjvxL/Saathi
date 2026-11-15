"use client";

import Lenis from "lenis";
import { useEffect } from "react";

/**
 * Smooth, gently eased scrolling for the landing page (Lenis), including the in-page links.
 * It's skipped when the visitor prefers reduced motion; touch screens keep their native scrolling.
 */
export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({ autoRaf: true, duration: 1.15, anchors: { offset: -72 } });
    return () => lenis.destroy();
  }, []);
  return null;
}
