/**
 * Brings the database up to date when the server starts (see lib/migrate.ts).
 * A failure is logged, not thrown: requests retry it, so a database that's
 * briefly unreachable at boot doesn't keep the whole app down.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || !process.env.DATABASE_URL) return;
  // `next build` loads this too, and Hostinger's build container can't
  // reach the database.
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { ensureDatabase } = await import("@/lib/migrate");
  await ensureDatabase().catch((error) => console.error("[migrate] start-up migration failed", error));
}
