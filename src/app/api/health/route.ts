import { ensureDatabase } from "@/lib/migrate";

export const dynamic = "force-dynamic";

/** Up, and the database reachable and migrated. */
export async function GET(): Promise<Response> {
  try {
    await ensureDatabase();
    return Response.json({ ok: true });
  } catch (error) {
    console.error("[health]", error);
    return Response.json({ ok: false }, { status: 503 });
  }
}
