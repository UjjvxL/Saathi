import "server-only";
import { headers } from "next/headers";
import { connectDB, isDuplicateKeyError } from "./db";
import { RateLimit } from "./models";

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

/**
 * Test servers make many accounts from one address, so e2e/start-server.mjs raises every limit with
 * RATE_LIMIT_SCALE. It can only loosen limits, and production leaves it unset.
 */
function scaled(limit: number): number {
  const scale = Number(process.env.RATE_LIMIT_SCALE);
  return Number.isFinite(scale) && scale > 1 ? Math.round(limit * scale) : limit;
}

/**
 * Fixed-window rate limiter stored in MongoDB, so it works across multiple server instances
 * (e.g. several Cloud Run containers). Expired windows are removed by a TTL index.
 */
export async function rateLimit(key: string, baseLimit: number, windowSeconds: number): Promise<RateLimitResult> {
  const limit = scaled(baseLimit);
  await connectDB();
  const now = new Date();
  const current = await RateLimit.findOneAndUpdate(
    { key, expiresAt: { $gt: now } },
    { $inc: { count: 1 } },
    { returnDocument: "after" },
  ).lean();

  if (current) {
    const retryAfterSeconds = Math.max(1, Math.ceil((current.expiresAt.getTime() - now.getTime()) / 1000));
    return { allowed: current.count <= limit, retryAfterSeconds };
  }

  // No live window: start a new one (this also replaces an expired window the TTL monitor hasn't removed yet).
  try {
    await RateLimit.updateOne(
      { key },
      { $set: { count: 1, expiresAt: new Date(now.getTime() + windowSeconds * 1000) } },
      { upsert: true },
    );
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error; // a parallel request created the window first
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

/**
 * Best-effort client IP for rate limiting. On Cloud Run the platform appends the real client
 * address to X-Forwarded-For, so the last entry is used (earlier entries can be spoofed).
 */
export async function clientIp(): Promise<string> {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");
  const last = forwarded?.split(",").map((part) => part.trim()).filter(Boolean).pop();
  return last || headerList.get("x-real-ip") || "unknown";
}
