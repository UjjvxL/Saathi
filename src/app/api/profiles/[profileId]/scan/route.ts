// AI prescription reader: a care-circle member uploads a photo, Gemini suggests medicines,
// and a person reviews them before anything is saved.
import { AiUserError, isAiConfigured, readPrescription } from "@/lib/ai/gemini";
import { findMemberContext } from "@/lib/auth/dal";
import { rateLimit } from "@/lib/rate-limit";

// Reading a photo can take a few seconds; allow up to a minute on serverless hosts like Vercel.
export const maxDuration = 60;

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
// Vercel accepts request bodies up to 4.5 MB; the browser shrinks photos well below this first.
const MAX_BYTES = 4 * 1024 * 1024;

export async function POST(request: Request, context: RouteContext<"/api/profiles/[profileId]/scan">) {
  const { profileId } = await context.params;
  const member = await findMemberContext(profileId);
  if (!member) return Response.json({ error: "Please sign in to a care circle first." }, { status: 403 });
  if (!isAiConfigured()) {
    return Response.json(
      { error: "AI scanning isn’t set up yet. Add GEMINI_API_KEY to the server environment." },
      { status: 503 },
    );
  }

  const limit = await rateLimit(`scan:${member.user.id}`, 15, 60 * 60);
  if (!limit.allowed) {
    return Response.json({ error: "You’ve scanned a lot of images. Please try again in a little while." }, { status: 429 });
  }

  let image: FormDataEntryValue | null;
  try {
    image = (await request.formData()).get("image");
  } catch {
    return Response.json({ error: "Please upload a photo of the prescription." }, { status: 400 });
  }
  if (!(image instanceof File) || image.size === 0) {
    return Response.json({ error: "Please upload a photo of the prescription." }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(image.type)) {
    return Response.json({ error: "Please upload a JPG, PNG or WebP photo." }, { status: 415 });
  }
  if (image.size > MAX_BYTES) {
    return Response.json({ error: "That photo is too large. Please use one under 4 MB." }, { status: 413 });
  }

  try {
    const result = await readPrescription({ data: Buffer.from(await image.arrayBuffer()), mimeType: image.type });
    return Response.json(result);
  } catch (error) {
    if (error instanceof AiUserError) return Response.json({ error: error.message }, { status: 422 });
    console.error("[scan] Gemini request failed", error);
    return Response.json({ error: "The AI reader is unavailable right now. Please add medicines manually." }, { status: 502 });
  }
}
