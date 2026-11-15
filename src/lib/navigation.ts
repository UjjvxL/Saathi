// Client-safe navigation helpers.

/** Keeps `?next=` redirects on this site (blocks "//evil.com" and absolute URLs). */
export function safeNextPath(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
