// Runs once when the Next.js server starts.
//
// Reminders are normally triggered from outside: GitHub Actions, cron-job.org or Cloud Scheduler call
// /api/cron/reminders every 5 minutes. This optional in-app timer calls the same endpoint itself, for
// an always-on server without a scheduler, or to get reminders while developing locally.
//
// It is OFF unless REMINDER_INTERVAL_SECONDS is set (30 or more). Leave it off on any copy that shares
// its database with the live site: whichever copy checks first sends the email, and a local copy would
// send links to http://localhost:3000 that don't work on anyone's phone.

type ReminderTimerState = { __saathiReminderTimer?: ReturnType<typeof setInterval> };

const LOCAL_ADDRESS = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?(\/|$)/i;

export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const seconds = Number(process.env.REMINDER_INTERVAL_SECONDS ?? 0);
  const secret = process.env.CRON_SECRET;
  if (!seconds || seconds < 30 || !secret) return;

  const state = globalThis as ReminderTimerState;
  if (state.__saathiReminderTimer) return; // already running (e.g. after a hot reload)

  const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
  const url = `${appUrl}/api/cron/reminders`;

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
  console.info(`[reminders] in-app scheduler on: checking every ${seconds}s`);
  if (LOCAL_ADDRESS.test(appUrl)) {
    console.warn(
      `[reminders] Emails sent from here will link to ${appUrl}. If this database is shared with your live site, ` +
        "remove REMINDER_INTERVAL_SECONDS so the live site sends reminders (with working links).",
    );
  }
}
