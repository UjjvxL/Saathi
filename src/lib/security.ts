// Small security helpers with no framework dependencies (unit tested).
import { randomInt, timingSafeEqual } from "node:crypto";
import { safeNextPath } from "./navigation";

// No 0/O or 1/I so a Care ID is easy to read out over the phone.
const CARE_ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Public identifier of a care profile, e.g. "K7M2XQ". Shared together with the secret passcode. */
export function generateCareId(length = 6): string {
  let id = "";
  for (let i = 0; i < length; i++) id += CARE_ID_ALPHABET[randomInt(CARE_ID_ALPHABET.length)];
  return id;
}

/** 6-digit secret passcode. Only its bcrypt hash is stored. */
export function generatePasscode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function normalizeCareId(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Only allow same-site relative redirects, so `?next=` can't send users to another site. */
export function safeRedirectPath(next: unknown, fallback = "/dashboard"): string {
  return safeNextPath(typeof next === "string" ? next : null, fallback);
}

/** Constant-time string comparison for secrets such as the cron token. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escapes user-provided text before it goes into an HTML email. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}
