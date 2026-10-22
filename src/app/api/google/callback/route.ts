import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { appUrl } from "@/lib/brand";
import { getAuthenticatedUser } from "@/lib/auth";
import { ensureDatabase } from "@/lib/migrate";
import { exchangeCodeForTokens } from "@/lib/google/oauth";

const STATE_COOKIE = "qm_google_state";

function sameState(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Where Google sends the owner back after they allow access. */
export async function GET(request: Request): Promise<Response> {
  const back = (result: string) => NextResponse.redirect(`${appUrl()}/account?${result}`);
  if (!(await getAuthenticatedUser())) return NextResponse.redirect(`${appUrl()}/login`);

  const params = new URL(request.url).searchParams;
  const jar = await cookies();
  const expected = jar.get(STATE_COOKIE)?.value;
  jar.delete({ name: STATE_COOKIE, path: "/api/google" });

  if (params.get("error")) return back("googleError=denied");
  const code = params.get("code");
  if (!code || !sameState(params.get("state"), expected)) return back("googleError=failed");

  try {
    await ensureDatabase();
    await exchangeCodeForTokens(code);
  } catch (error) {
    console.error("[google] connect failed", error);
    return back("googleError=failed");
  }
  return back("googleConnected=1");
}
