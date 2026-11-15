// Optimistic auth check that runs before every page request. It only reads the signed session
// cookie (no database); the real authorization happens in the Data Access Layer.
import { NextResponse, type NextRequest } from "next/server";
import { verifySession } from "@/lib/auth/jwt";
import { SESSION_COOKIE } from "@/lib/constants";

const PROTECTED = ["/dashboard", "/profiles", "/join", "/p", "/elder"];
const AUTH_PAGES = ["/login", "/signup"];

function matches(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

export async function proxy(request: NextRequest) {
  const { pathname, search, searchParams } = request.nextUrl;
  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);

  if (!session && PROTECTED.some((base) => matches(pathname, base))) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  // Signed-in users skip the landing and auth pages (unless their account no longer exists).
  if (session && (pathname === "/" || AUTH_PAGES.includes(pathname)) && !searchParams.has("expired")) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|manifest.webmanifest|robots.txt|sitemap.xml|opengraph-image|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)",
  ],
};
