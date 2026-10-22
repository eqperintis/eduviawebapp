import "server-only";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { pickClientIp } from "@/lib/client-ip";

const WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_PER_WINDOW = 15;

async function clientIp(): Promise<string> {
  return pickClientIp(await headers());
}

/**
 * A best-effort per-IP submission cap for a public form — backed by the
 * database (RateLimitBucket) rather than an in-memory map, so the limit is
 * accurate no matter how many Node processes actually end up serving
 * traffic, and survives a deploy instead of silently resetting everyone's
 * count back to zero.
 *
 * `formKey` scopes the limit per form (so filling out the job application
 * doesn't use up your budget for booking a class) — call this first, before
 * any other DB work, and return its `error` directly if not ok.
 *
 * Fails OPEN on any database error (including "table doesn't exist yet" —
 * this ships in the same deploy as the migration that creates
 * RateLimitBucket, and the two aren't guaranteed to land in the same
 * instant) — a public form must never go down because its spam guard
 * couldn't reach the database; that would be a self-inflicted outage far
 * worse than the spam it's meant to stop.
 */
export async function checkPublicFormRateLimit(
  formKey: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const ip = await clientIp();
    // MySQL's key column is VARCHAR(191) — formKey is always a short fixed
    // string from call sites, so only the IP half is realistically at risk
    // of an unusual length (e.g. a spoofed X-Forwarded-For); truncate as a
    // safety margin rather than let an oversized value throw.
    const key = `${formKey}:${ip}`.slice(0, 191);
    const now = new Date();
    const windowStart = new Date(now.getTime() - WINDOW_MS);

    // Opportunistic, cheap cleanup of expired rows — no cron needed. ~2%
    // of calls is enough to keep this bounded without adding a query to
    // every single one.
    if (Math.random() < 0.02) {
      db.rateLimitBucket.deleteMany({ where: { windowStart: { lt: windowStart } } }).catch(() => null);
    }

    // Atomic: only increments a bucket that's both still within its window
    // and under the cap. Two requests landing at the exact same instant
    // can't both slip past the cap this way — MySQL serializes the update.
    const incremented = await db.rateLimitBucket.updateMany({
      where: { key, windowStart: { gt: windowStart }, count: { lt: MAX_PER_WINDOW } },
      data: { count: { increment: 1 } },
    });
    if (incremented.count > 0) return { ok: true };

    // Nothing got incremented — find out why: either a live bucket is
    // already at the cap (blocked), or there's no valid bucket yet (first
    // request in a fresh window, or the previous window expired).
    const existing = await db.rateLimitBucket.findUnique({ where: { key } });
    if (existing && existing.windowStart > windowStart && existing.count >= MAX_PER_WINDOW) {
      return { ok: false, error: "Too many submissions — please wait a few minutes and try again." };
    }

    await db.rateLimitBucket.upsert({
      where: { key },
      create: { key, count: 1, windowStart: now },
      update: { count: 1, windowStart: now },
    });
    return { ok: true };
  } catch (error) {
    console.error("[rate-limit] check failed, allowing request through", error);
    return { ok: true };
  }
}


// --- Login throttling ------------------------------------------------------
// Failed sign-ins are counted per email AND per visitor address. A stranger
// hammering someone's email therefore only blocks their own address — the real
// owner, signing in from somewhere else, is never locked out by it.
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_MAX_FAILURES_PER_ADDRESS = 5;

async function loginKey(email: string): Promise<string> {
  return `login:${email}:${await clientIp()}`.slice(0, 191);
}

/** Minutes this visitor must still wait to try this email again, or 0 if they may try. Fails open on a database error. */
export async function loginWaitMinutes(email: string): Promise<number> {
  try {
    const bucket = await db.rateLimitBucket.findUnique({ where: { key: await loginKey(email) } });
    if (!bucket || bucket.count < LOGIN_MAX_FAILURES_PER_ADDRESS) return 0;
    const remaining = bucket.windowStart.getTime() + LOGIN_WINDOW_MS - Date.now();
    return remaining > 0 ? Math.ceil(remaining / 60_000) : 0;
  } catch (error) {
    console.error("[rate-limit] login check failed, allowing attempt", error);
    return 0;
  }
}

export async function recordLoginFailure(email: string): Promise<void> {
  try {
    const key = await loginKey(email);
    const windowStart = new Date(Date.now() - LOGIN_WINDOW_MS);
    const incremented = await db.rateLimitBucket.updateMany({
      where: { key, windowStart: { gt: windowStart } },
      data: { count: { increment: 1 } },
    });
    if (incremented.count === 0) {
      await db.rateLimitBucket.upsert({
        where: { key },
        create: { key, count: 1, windowStart: new Date() },
        update: { count: 1, windowStart: new Date() },
      });
    }
  } catch (error) {
    console.error("[rate-limit] recording login failure failed", error);
  }
}

export async function clearLoginFailures(email: string): Promise<void> {
  try {
    await db.rateLimitBucket.deleteMany({ where: { key: await loginKey(email) } });
  } catch (error) {
    console.error("[rate-limit] clearing login failures failed", error);
  }
}
