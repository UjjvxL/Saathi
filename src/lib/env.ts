import "server-only";
import { siteUrl } from "./site-url";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable ${name}. Copy .env.example to .env.local and fill it in.`);
  }
  return value;
}

/** Typed, lazily-read environment variables (read at call time so builds don't need secrets). */
export const env = {
  mongoUri: () => required("MONGODB_URI"),
  mongoDbName: () => process.env.MONGODB_DB || "saathi",
  appUrl: () => siteUrl(),
  cronSecret: () => process.env.CRON_SECRET || "",
  geminiApiKey: () => process.env.GEMINI_API_KEY || "",
  geminiModel: () => process.env.GEMINI_MODEL || "gemini-3.5-flash",
  smtp: () => {
    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    if (!host || !user || !pass) return null;
    return {
      host,
      port: Number(process.env.SMTP_PORT || 465),
      user,
      pass,
      from: process.env.EMAIL_FROM || `Saathi <${user}>`,
    };
  },
};
