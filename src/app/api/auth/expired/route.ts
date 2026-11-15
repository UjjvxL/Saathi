// Clears a session cookie that is still correctly signed but no longer valid (the account was
// deleted, the password was reset on another device, or the app moved to a new database).
// Without this, the proxy would keep treating the visitor as signed in and bounce them away from
// the sign-up page. A valid session is never cleared here, so this can't be used to log people out.
import { getCurrentUser } from "@/lib/auth/dal";
import { clearedSessionCookie } from "@/lib/auth/session";

export async function GET() {
  const user = await getCurrentUser();
  if (user) {
    return new Response(null, { status: 303, headers: { Location: "/dashboard", "Cache-Control": "no-store" } });
  }
  return new Response(null, {
    status: 303,
    headers: { Location: "/login?expired=1", "Set-Cookie": clearedSessionCookie(), "Cache-Control": "no-store" },
  });
}
