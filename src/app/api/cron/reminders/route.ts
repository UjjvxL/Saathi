// The reminder engine. Something must call this every 5 minutes: GitHub Actions
// (.github/workflows/reminders.yml), cron-job.org, Google Cloud Scheduler, or Vercel Cron on paid plans.
//   curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<your-app>/api/cron/reminders
import { runReminders } from "@/lib/reminders";
import { safeEqual } from "@/lib/security";

// Give a busy run up to a minute on serverless hosts.
export const maxDuration = 60;

async function handle(request: Request): Promise<Response> {
  // Read the request first so this handler is never prerendered at build time.
  const authorization = request.headers.get("authorization") ?? "";
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: "CRON_SECRET is not configured on the server." }, { status: 503 });
  }
  if (!safeEqual(authorization, `Bearer ${secret}`)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = new Date();
  const summary = await runReminders(startedAt);
  return Response.json({ ok: true, ranAt: startedAt.toISOString(), ...summary });
}

export const GET = handle;
export const POST = handle;
