const LOCAL_ADDRESS = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?(\/|$)/i;

/**
 * The app's public address, used in email links and page metadata.
 * APP_URL wins when set; on Vercel it falls back to the project's production domain automatically.
 * A localhost APP_URL (e.g. copied over from .env.local) is ignored on Vercel, where it can't be right.
 */
export function siteUrl(): string {
  const explicit = process.env.APP_URL?.trim();
  const onVercel = Boolean(process.env.VERCEL);
  if (explicit && !(onVercel && LOCAL_ADDRESS.test(explicit))) return explicit.replace(/\/+$/, "");
  const vercelDomain = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (vercelDomain) return `https://${vercelDomain.replace(/\/+$/, "")}`;
  return explicit ? explicit.replace(/\/+$/, "") : "http://localhost:3000";
}
