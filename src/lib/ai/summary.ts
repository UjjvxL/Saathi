import "server-only";
import { isSafeAiSummary, type AiFacts } from "@/lib/insights-core";
import { candidateModels, getClient, isAiConfigured, shouldTryNextModel } from "./gemini";

const INSTRUCTION = `You write a short, warm weekly note for a family who look after an elderly person.
Use ONLY the facts in the JSON below.

Rules:
- 2 to 4 short sentences in plain, friendly English, under 90 words in total.
- Only use numbers that appear in the facts. Never invent, estimate or calculate new numbers.
- Describe the routine only. Do not give advice of any kind and do not tell anyone what to do.
- Never diagnose, never mention illnesses, symptoms or side effects, and never suggest starting, stopping or changing a medicine or a dose.
- Do not use anyone's name. Write neutrally, for example: "This week, 23 of 25 doses were taken."
- "missed" means a person recorded that a dose wasn't taken; "unconfirmed" means nobody recorded anything in time. Keep them distinct.

Return JSON: {"summary": "..."}`;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: { summary: { type: "string" } },
  required: ["summary"],
};

/**
 * Asks Gemini to turn the week's numbers into a friendly note. Returns null when the answer can't be
 * read or fails the safety checks (the caller then shows Saathi's own rule-based summary instead).
 * Only aggregated numbers and medicine/time labels are sent: never names, emails or notes.
 */
export async function writeFriendlySummary(facts: AiFacts): Promise<string | null> {
  if (!isAiConfigured()) return null;
  const ai = getClient();
  const contents = [{ role: "user", parts: [{ text: `${INSTRUCTION}\n\nFacts:\n${JSON.stringify(facts, null, 2)}` }] }];
  const config = { responseMimeType: "application/json", responseJsonSchema: RESPONSE_SCHEMA, temperature: 0.2 };

  let response: Awaited<ReturnType<typeof ai.models.generateContent>> | undefined;
  let lastError: unknown;
  for (const model of candidateModels()) {
    try {
      response = await ai.models.generateContent({ model, contents, config });
      break;
    } catch (error) {
      lastError = error;
      if (!shouldTryNextModel(error)) throw error;
      console.warn(`[insights] Gemini model "${model}" is unavailable right now; trying the next one`);
    }
  }
  if (!response) throw lastError;

  let summary: unknown;
  try {
    summary = (JSON.parse(response.text ?? "") as { summary?: unknown }).summary;
  } catch {
    return null;
  }
  if (typeof summary !== "string") return null;
  const cleaned = summary.replace(/\s+/g, " ").trim();
  return isSafeAiSummary(cleaned, facts) ? cleaned : null;
}
