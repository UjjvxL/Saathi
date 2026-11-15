import "server-only";
import { GoogleGenAI } from "@google/genai";
import { MED_FORMS } from "@/lib/constants";
import { env } from "@/lib/env";
import { isValidTime } from "@/lib/schedule";
import { scanResultSchema, type ScannedMedicine } from "@/lib/validation";

/** An error whose message is safe to show to the user. */
export class AiUserError extends Error {}

let client: GoogleGenAI | null = null;

export function isAiConfigured(): boolean {
  return Boolean(env.geminiApiKey());
}

/** The shared Gemini client (also used by the weekly insights summary). */
export function getClient(): GoogleGenAI {
  const apiKey = env.geminiApiKey();
  if (!apiKey) throw new AiUserError("AI scanning isn’t set up yet. Add GEMINI_API_KEY to the server environment.");
  // Never leave someone waiting on "Reading prescription…" for more than a minute.
  client ??= new GoogleGenAI({ apiKey, httpOptions: { timeout: 60_000 } });
  return client;
}

/**
 * Tried in order after GEMINI_MODEL, so scanning keeps working when Google retires a model name,
 * a model is overloaded, or its free quota runs out. (Checked against the live API in Nov 2026.)
 */
const FALLBACK_MODELS = ["gemini-3.5-flash", "gemini-3.5-flash-lite"];

export function candidateModels(configured: string = env.geminiModel()): string[] {
  return [...new Set([configured, ...FALLBACK_MODELS].filter(Boolean))];
}

/** Errors where another model may well succeed straight away (but not slow timeouts). */
export function shouldTryNextModel(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /NOT_FOUND|is not found|no longer available|not supported for generateContent|UNAVAILABLE|overloaded|RESOURCE_EXHAUSTED/i.test(
    message,
  );
}

const PROMPT = `You are helping a family set up medicine reminders for an elderly person.
Read this prescription or medicine label and list every medicine on it.

For each medicine return:
- name: the medicine name exactly as written (fix only obvious reading mistakes).
- dosage: strength per dose, e.g. "500 mg", "5 ml", "1 puff". Empty string if not written.
- form: one of ${MED_FORMS.join(", ")}.
- times: 24-hour "HH:mm" times per day. Convert shorthand:
  OD / once daily -> ["08:00"]; BD / BID / twice daily -> ["08:00","20:00"];
  TDS / TID / thrice daily -> ["08:00","14:00","20:00"]; QID -> ["06:00","12:00","18:00","22:00"];
  HS / at bedtime -> ["22:00"]; 1-0-1 -> ["08:00","20:00"]; 1-1-1 -> ["08:00","14:00","20:00"];
  1-0-0 -> ["08:00"]; 0-0-1 -> ["21:00"]. If the timing is unclear use ["08:00"].
- instructions: short plain-English instructions such as "After food" or "Before breakfast". Empty string if none.
- durationDays: number of days if a duration is written (e.g. "x 5 days"), otherwise null.

Never invent medicines that are not in the image. If the image is not a prescription or a medicine label,
return an empty medicines list and explain why in notes. Keep notes under 200 characters.`;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    medicines: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          dosage: { type: "string" },
          form: { type: "string", enum: [...MED_FORMS] },
          times: { type: "array", items: { type: "string" } },
          instructions: { type: "string" },
          durationDays: { type: ["integer", "null"] },
        },
        required: ["name", "dosage", "form", "times", "instructions", "durationDays"],
      },
    },
    notes: { type: "string" },
  },
  required: ["medicines", "notes"],
};

function normalizeTimes(times: string[]): string[] {
  const valid = times.map((time) => time.trim().padStart(5, "0")).filter(isValidTime);
  return valid.length ? [...new Set(valid)].sort().slice(0, 8) : ["08:00"];
}

/** Reads a prescription photo with Gemini and returns suggested medicines (always reviewed by a person before saving). */
export async function readPrescription(image: {
  data: Buffer;
  mimeType: string;
}): Promise<{ medicines: ScannedMedicine[]; notes: string }> {
  const ai = getClient();
  const contents = [
    {
      role: "user",
      parts: [{ inlineData: { mimeType: image.mimeType, data: image.data.toString("base64") } }, { text: PROMPT }],
    },
  ];
  const config = { responseMimeType: "application/json", responseJsonSchema: RESPONSE_SCHEMA, temperature: 0.1 };

  let response: Awaited<ReturnType<typeof ai.models.generateContent>> | undefined;
  let lastError: unknown;
  for (const model of candidateModels()) {
    try {
      response = await ai.models.generateContent({ model, contents, config });
      break;
    } catch (error) {
      lastError = error;
      if (!shouldTryNextModel(error)) throw error;
      console.warn(`[scan] Gemini model "${model}" is unavailable right now; trying the next one`);
    }
  }
  if (!response) throw lastError;

  let parsed: unknown;
  try {
    parsed = JSON.parse(response.text ?? "");
  } catch {
    throw new AiUserError("Couldn’t read that image. Please try a clearer, well-lit photo.");
  }
  const result = scanResultSchema.safeParse(parsed);
  if (!result.success) throw new AiUserError("Couldn’t read that image. Please try a clearer, well-lit photo.");

  return {
    medicines: result.data.medicines.map((medicine) => ({ ...medicine, times: normalizeTimes(medicine.times) })),
    notes: result.data.notes,
  };
}
