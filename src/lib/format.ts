// Tiny formatting helpers that are safe (and cheap) to use in client components.

/** "08:30" -> "8:30 AM" */
export function formatTime12h(localTime: string): string {
  const [hourText, minute] = localTime.split(":");
  const hour = Number(hourText);
  const suffix = hour < 12 ? "AM" : "PM";
  return `${((hour + 11) % 12) + 1}:${minute} ${suffix}`;
}
