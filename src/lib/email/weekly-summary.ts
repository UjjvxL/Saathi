import "server-only";
import type { WeeklySummary } from "@/lib/insights";
import { render, type EmailContent } from "./templates";

/**
 * The weekly family email. The subject and opening lines (what phones show in notification previews)
 * never name a medicine; details stay inside the email, which only goes to the care circle.
 */
export function weeklySummaryEmail(summary: WeeklySummary, appUrl: string): EmailContent {
  const counts = summary.report.week.summary;
  const rate = counts.rate;
  return render({
    tone: rate !== null && rate < 70 ? "warning" : "info",
    subject: `${summary.elderName}’s weekly care summary (${summary.fromLabel} – ${summary.toLabel})`,
    heading: rate === null ? `${summary.elderName}’s week in Saathi` : `${summary.elderName}’s week: ${rate}% of doses taken`,
    paragraphs: [
      `Here’s how ${summary.periodLabel} went, based on what the care circle recorded. Saathi describes routines only and doesn’t give medical advice.`,
      ...summary.report.insights.map((insight) => insight.text),
    ],
    items: counts.total
      ? [
          `Taken: ${counts.taken}`,
          `Skipped: ${counts.skipped}`,
          `Missed (recorded by someone): ${counts.missed}`,
          `Unconfirmed (nobody recorded it in time): ${counts.unconfirmed}`,
        ]
      : [],
    cta: { label: "Open health insights", url: appUrl },
  });
}
