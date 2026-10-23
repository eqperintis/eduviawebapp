import "server-only";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { MIGRATIONS } from "@/lib/migrations";
import { learnFields, type FieldDef } from "@/lib/forms/fields";
import { pageUrlFromReferrer } from "@/lib/forms/origin";
import { trackingColumns } from "@/lib/forms/utm";

/**
 * Brings the database up to date on start-up: applies any migration not yet
 * recorded, then creates the first admin from ADMIN_EMAIL/ADMIN_PASSWORD and
 * the Eduvia enquiry form if the database is brand new. Safe to run on
 * every start and from several processes at once (MySQL named lock).
 */

const LOCK_NAME = "eduvia_marketing_migrate";

function splitStatements(sql: string): string[] {
  return sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(/;\s*(?:\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

type Tx = Prisma.TransactionClient;

async function applyMigrations(tx: Tx): Promise<string[]> {
  await tx.$executeRawUnsafe(
    "CREATE TABLE IF NOT EXISTS `_app_migrations` (`id` VARCHAR(191) NOT NULL PRIMARY KEY, `appliedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
  );
  const rows = await tx.$queryRawUnsafe<{ id: string }[]>("SELECT `id` FROM `_app_migrations`");
  const done = new Set(rows.map((row) => row.id));
  const applied: string[] = [];

  for (const migration of MIGRATIONS) {
    if (done.has(migration.id)) continue;
    for (const statement of splitStatements(migration.sql)) {
      await tx.$executeRawUnsafe(statement);
    }
    await tx.$executeRawUnsafe("INSERT INTO `_app_migrations` (`id`) VALUES (?)", migration.id);
    applied.push(migration.id);
  }
  return applied;
}

/**
 * One-off data fixes, run once each like the SQL migrations and recorded in
 * the same table.
 */
const DATA_JOBS: { id: string; run: (tx: Tx) => Promise<void> }[] = [
  {
    // The first version gave the Quolume app's form a starter field list copied
    // from an old apply form. A form's fields must only ever be what it has
    // actually sent, so rebuild every form's list from its submissions.
    id: "0004_relearn_form_fields",
    run: async (tx) => {
      const forms = await tx.form.findMany({ select: { id: true } });
      for (const form of forms) {
        const submissions = await tx.formSubmission.findMany({
          where: { formId: form.id },
          orderBy: { createdAt: "asc" },
          select: { data: true },
        });
        let fields: FieldDef[] = [];
        for (const submission of submissions) {
          try {
            fields = learnFields(fields, JSON.parse(submission.data) as Record<string, unknown>) ?? fields;
          } catch {
            // A submission that isn't valid JSON teaches nothing.
          }
        }
        await tx.form.update({
          where: { id: form.id },
          data: { fields: fields.length ? JSON.stringify(fields) : null },
        });
      }
    },
  },
  {
    // Forms that already have submissions: their page is where those came from.
    id: "0007_form_page_from_referrer",
    run: async (tx) => {
      const forms = await tx.form.findMany({ where: { pageUrl: null }, select: { id: true } });
      for (const form of forms) {
        // Filtered here rather than with LIKE: Hostinger's MySQL rejects
        // Prisma's LIKE on this column (collation mismatch).
        const recent = await tx.formSubmission.findMany({
          where: { formId: form.id },
          orderBy: { createdAt: "desc" },
          take: 20,
          select: { referrer: true },
        });
        const pageUrl = recent.map((entry) => pageUrlFromReferrer(entry.referrer)).find(Boolean) ?? null;
        if (pageUrl) await tx.form.update({ where: { id: form.id }, data: { pageUrl } });
      }
    },
  },
  {
    // Submissions from before 0008 have their tags only inside `data`: copy
    // them into the new columns so the Links page counts them too.
    id: "0009_submission_tracking_columns",
    run: async (tx) => {
      let cursor: string | undefined;
      for (;;) {
        const batch = await tx.formSubmission.findMany({
          orderBy: { id: "asc" },
          take: 500,
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
          select: { id: true, data: true },
        });
        if (batch.length === 0) break;
        for (const submission of batch) {
          let data: Record<string, unknown>;
          try {
            data = JSON.parse(submission.data) as Record<string, unknown>;
          } catch {
            continue;
          }
          const columns = trackingColumns(data);
          if (Object.values(columns).some(Boolean)) {
            await tx.formSubmission.update({ where: { id: submission.id }, data: columns });
          }
        }
        cursor = batch[batch.length - 1].id;
      }
    },
  },
];

async function runDataJobs(tx: Tx): Promise<string[]> {
  const rows = await tx.$queryRawUnsafe<{ id: string }[]>("SELECT `id` FROM `_app_migrations`");
  const done = new Set(rows.map((row) => row.id));
  const ran: string[] = [];
  for (const job of DATA_JOBS) {
    if (done.has(job.id)) continue;
    await job.run(tx);
    await tx.$executeRawUnsafe("INSERT INTO `_app_migrations` (`id`) VALUES (?)", job.id);
    ran.push(job.id);
  }
  return ran;
}

/** `fresh`: the tables were created in this same start-up, i.e. a brand-new database. */
async function seed(tx: Tx, fresh: boolean): Promise<void> {
  if ((await tx.user.count()) === 0) {
    const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD;
    if (email && password) {
      await tx.user.create({ data: { email, passwordHash: await bcrypt.hash(password, 12) } });
      console.log(`[migrate] created admin ${email}`);
    } else {
      console.warn("[migrate] no users yet: set ADMIN_EMAIL and ADMIN_PASSWORD and restart to create the admin.");
    }
  }

  // Only on a brand-new database. Checking for "no forms" instead brought the
  // starter form back on every restart after the owner deleted all their forms.
  if (fresh && (await tx.form.count()) === 0) {
    await tx.form.create({
      data: {
        name: "Eduvia: Enquiry",
        publicId: "eduvia-enquiry",
        allowedDomains: "eduvia.my",
        notifyEmails: process.env.ADMIN_EMAIL ?? "",
        successTitle: "Thank you, we've got it.",
        successMessage: "We'll read your enquiry and get back to you soon.",
      },
    });
    console.log("[migrate] created the Eduvia enquiry form");
  }
}

let pending: Promise<void> | null = null;

export function ensureDatabase(): Promise<void> {
  // An interactive transaction pins one connection, which is what the named
  // lock belongs to. (DDL commits implicitly in MySQL; the transaction is
  // only here for the connection.)
  pending ??= db
    .$transaction(
      async (tx) => {
        const [lock] = await tx.$queryRawUnsafe<{ ok: number | bigint | null }[]>(
          "SELECT GET_LOCK(?, 60) AS ok",
          LOCK_NAME,
        );
        if (Number(lock?.ok) !== 1) throw new Error("Couldn't get the migration lock");
        try {
          const applied = await applyMigrations(tx);
          if (applied.length) console.log(`[migrate] applied ${applied.join(", ")}`);
          const jobs = await runDataJobs(tx);
          if (jobs.length) console.log(`[migrate] ran ${jobs.join(", ")}`);
          await seed(tx, applied.includes("0001_init"));
        } finally {
          await tx.$queryRawUnsafe("SELECT RELEASE_LOCK(?)", LOCK_NAME);
        }
      },
      { timeout: 120_000, maxWait: 30_000 },
    )
    .catch((error) => {
      // Let the next request try again rather than caching the failure.
      pending = null;
      throw error;
    });
  return pending;
}

/** A random, URL-safe id for a new form endpoint, e.g. "x7k2m9qa". */
export function newPublicId(): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(8);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}
