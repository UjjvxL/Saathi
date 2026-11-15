// Logging out is a normal form POST followed by a full page load. Next.js keeps visited pages
// alive (hidden) for instant back-navigation; a full reload makes sure nothing from the previous
// user stays in the browser, which matters on a family's shared phone or computer.
import { clearedSessionCookie } from "@/lib/auth/session";

export async function POST(request: Request) {
  // Only this site may log people out (stops other sites from forcing a logout).
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (origin && host && new URL(origin).host !== host) {
    return new Response("Forbidden", { status: 403 });
  }

  return new Response(null, {
    status: 303,
    headers: { Location: "/login", "Set-Cookie": clearedSessionCookie(), "Cache-Control": "no-store" },
  });
}
