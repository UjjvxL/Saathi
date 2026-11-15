// Runs once when the Next.js server starts.
//
// In production on Cloud Run, Google Cloud Scheduler calls /api/cron/reminders every 5 minutes.
// While developing there is no scheduler, so this calls the same endpoint every minute, so medicine
// and appointment reminders arrive on time locally too. Set REMINDER_INTERVAL_SECONDS to change the
// interval (or to enable it on an always-on server), and 0 to switch it off.

type ReminderTimerState = { __saathiReminderTimer?: ReturnType<typeof setInterval> };

export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const fallback = process.env.NODE_ENV === "development" ? 60 : 0;
  const seconds = Number(process.env.REMINDER_INTERVAL_SECONDS ?? fallback);
  const secret = process.env.CRON_SECRET;
  if (!seconds || seconds < 30 || !secret) return;

  const state = globalThis as ReminderTimerState;
  if (state.__saathiReminderTimer) return; // already running (e.g. after a hot reload)

  const url = `${(process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "")}/api/cron/reminders`;

  const tick = async () => {
    try {
      const response = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${secret}` } });
      if (!response.ok) {
        console.warn(`[reminders] check failed with status ${response.status} (is APP_URL right? It is ${url})`);
        return;
      }
      const summary = (await response.json()) as { emails?: number };
      if (summary.emails) console.info(`[reminders] sent ${summary.emails} email(s)`);
    } catch {
      // The server isn't accepting requests yet; the next tick will try again.
    }
  };

  state.__saathiReminderTimer = setInterval(tick, seconds * 1000);
  state.__saathiReminderTimer.unref?.();
  setTimeout(tick, 15_000).unref?.();
  console.info(`[reminders] local scheduler on: checking every ${seconds}s`);
}
