"use server";

import { isAiConfigured } from "@/lib/ai/gemini";
import { writeFriendlySummary } from "@/lib/ai/summary";
import { authorizeMember, ForbiddenError } from "@/lib/auth/guard";
import { getInsights } from "@/lib/insights";
import { buildAiFacts, ruleBasedSummary } from "@/lib/insights-core";
import { rateLimit } from "@/lib/rate-limit";
import type { FormState } from "@/lib/validation";

export interface InsightSummaryState extends FormState {
  summary?: string;
  /** "gemini" when the AI wrote it, "rules" when it's Saathi's own rule-based summary. */
  source?: "gemini" | "rules";
}

const AI_LIMIT_PER_HOUR = 6;

/**
 * Writes a friendly summary of the week with Gemini. Gemini only sees aggregated numbers and
 * medicine/time labels; anything it writes is safety-checked, and Saathi's own rule-based summary is
 * shown instead whenever the AI isn't available or its answer doesn't pass the checks.
 */
export async function summarizeInsights(profileId: string, _prev: InsightSummaryState, _formData: FormData): Promise<InsightSummaryState> {
  try {
    const context = await authorizeMember(profileId);
    if (!isAiConfigured()) return { message: "AI summaries aren’t set up on this server." };

    const limit = await rateLimit(`insights-ai:${context.user.id}`, AI_LIMIT_PER_HOUR, 60 * 60);
    if (!limit.allowed) {
      return { message: `You’ve asked for ${AI_LIMIT_PER_HOUR} summaries this hour. Please try again a little later.` };
    }

    const report = await getInsights(context.profile);
    const fallback = ruleBasedSummary(report);
    if (!report.week.summary.total) {
      return { ok: true, source: "rules", summary: fallback, message: "There isn’t enough data this week for an AI summary yet." };
    }

    let written: string | null = null;
    try {
      written = await writeFriendlySummary(buildAiFacts(report));
    } catch (error) {
      console.error("[insights] Gemini summary failed", error);
      return { ok: true, source: "rules", summary: fallback, message: "Gemini isn’t available right now, so here is Saathi’s own summary." };
    }
    if (!written) {
      return {
        ok: true,
        source: "rules",
        summary: fallback,
        message: "Gemini’s answer didn’t pass Saathi’s safety checks, so here is Saathi’s own summary.",
      };
    }
    return { ok: true, source: "gemini", summary: written };
  } catch (error) {
    if (error instanceof ForbiddenError) return { message: error.message };
    throw error;
  }
}
