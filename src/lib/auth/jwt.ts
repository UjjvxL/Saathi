// Token signing and verification. Kept free of `server-only` and `next/headers`
// because the proxy (src/proxy.ts) imports it too.
import { SignJWT, jwtVerify } from "jose";
import { SESSION_TTL_SECONDS } from "@/lib/constants";

export interface SessionPayload {
  userId: string;
  name: string;
  /** Matches User.sessionVersion; bumping it (e.g. on password reset) signs out every device. */
  version: number;
}

let cachedKey: Uint8Array | null = null;

function secretKey(): Uint8Array {
  if (cachedKey) return cachedKey;
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET must be a random string of at least 32 characters (see .env.example).");
  }
  cachedKey = new TextEncoder().encode(secret);
  return cachedKey;
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ name: payload.name, sv: payload.version })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.userId)
    .setAudience("session")
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());
}

export async function verifySession(token: string | null | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  const key = secretKey();
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"], audience: "session" });
    if (typeof payload.sub !== "string") return null;
    return {
      userId: payload.sub,
      name: typeof payload.name === "string" ? payload.name : "",
      version: typeof payload.sv === "number" ? payload.sv : 0,
    };
  } catch {
    return null;
  }
}

/**
 * Short-lived, single-purpose tokens (e.g. the "I took my medicines" link in reminder emails).
 * The purpose is stored as the audience so a token can never be reused for anything else.
 */
export async function signPurposeToken(
  purpose: string,
  claims: Record<string, string>,
  expiresIn: string,
): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(purpose)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secretKey());
}

export async function verifyPurposeToken(
  token: string | null | undefined,
  purpose: string,
): Promise<Record<string, unknown> | null> {
  if (!token) return null;
  const key = secretKey();
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"], audience: purpose });
    return payload;
  } catch {
    return null;
  }
}
