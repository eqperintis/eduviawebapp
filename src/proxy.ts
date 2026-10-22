import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

// Kept in step with SESSION_COOKIE in lib/auth.ts (not imported: that file
// is server-only and pulls in the database).
const SESSION_COOKIE = "edv_session";

// Public routes. /f is the form endpoint (and its hosted thank-you page),
// /u the unsubscribe link, /api/cron guards itself with CRON_SECRET.
const PUBLIC_PREFIXES = ["/login", "/forgot-password", "/reset-password", "/f/", "/u/", "/privacy", "/api/cron", "/api/health"];

function getSecretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token) {
    try {
      await jwtVerify(token, getSecretKey());
      return NextResponse.next();
    } catch {
      // fall through to the login redirect
    }
  }
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  // /brand/ holds the logo, fonts and icons: the sign-in page, the
  // hosted thank-you page and emails all need them without a session.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|brand/).*)"],
};
