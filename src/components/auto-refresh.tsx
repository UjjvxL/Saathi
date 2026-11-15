"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Keeps a shared screen up to date: when a family member marks a dose on their phone,
 * everyone else's view refreshes within the interval (and immediately when the tab regains focus).
 */
export function AutoRefresh({ intervalMs = 30_000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const timer = window.setInterval(refresh, intervalMs);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [router, intervalMs]);

  return null;
}
