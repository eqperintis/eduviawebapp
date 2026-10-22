import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { appUrl } from "@/lib/brand";
import { getAuthenticatedUser } from "@/lib/auth";
import { buildGoogleAuthUrl } from "@/lib/google/oauth";

// Checked in ../callback/route.ts.
const STATE_COOKIE = "qm_google_state";

/** Sends the owner to Google to connect the account the Sheets step writes with. */
export async function GET(): Promise<Response> {
  if (!(await getAuthenticatedUser())) return NextResponse.redirect(`${appUrl()}/login`);
  const state = randomBytes(24).toString("base64url");
  (await cookies()).set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/google",
    maxAge: 600,
  });
  try {
    return NextResponse.redirect(buildGoogleAuthUrl(state));
  } catch {
    return NextResponse.redirect(`${appUrl()}/account?googleError=config`);
  }
}
