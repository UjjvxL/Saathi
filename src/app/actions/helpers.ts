import "server-only";
import { ForbiddenError } from "@/lib/auth/guard";
import type { FormState } from "@/lib/validation";

/**
 * Runs an action body and turns permission errors into a friendly message.
 * Anything else (including Next.js redirects) is re-thrown untouched.
 */
export async function guarded(run: () => Promise<FormState>): Promise<FormState> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ForbiddenError) return { message: error.message };
    throw error;
  }
}
