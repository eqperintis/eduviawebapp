import { timingSafeEqual } from "crypto";
import { ensureDatabase } from "@/lib/migrate";
import { advanceDueRuns } from "@/lib/automations/engine";

/**
 * Advances automation runs whose Wait has passed. Hit by a Hostinger cron job
 * every few minutes:
 *   curl -s "https://marketing.eduvia.my/api/cron/automations?secret=..."
 */

export const dynamic = "force-dynamic";

function secretMatches(given: string | null): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const given = url.searchParams.get("secret") ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
  if (!secretMatches(given)) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  await ensureDatabase();
  const advanced = await advanceDueRuns();
  return Response.json({ ok: true, advanced });
}
