import "server-only";
import { lookup } from "dns/promises";
import { isIP } from "net";
import { db } from "@/lib/db";
import { parseFields } from "@/lib/forms/fields";
import { mergeScannedFields, scanFormHtml } from "@/lib/forms/page-scan";

/**
 * Fetches the page a form lives on and folds its questions and options into
 * the form's fields (see page-scan.ts). The address can come from a
 * visitor's Referer header, so only public web pages are fetched: never
 * localhost or a private network address, with a short timeout and a size cap.
 */

/** How long a read stays fresh before the page is read again. */
export const PAGE_STALE_MS = 6 * 60 * 60 * 1000;
const TIMEOUT_MS = 8_000;
const MAX_BYTES = 3 * 1024 * 1024;
const MAX_REDIRECTS = 3;

function privateAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const [a, b] = address.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
    );
  }
  if (family === 6) {
    const lower = address.toLowerCase();
    if (lower.startsWith("::ffff:")) return privateAddress(lower.slice(7));
    return lower === "::" || lower === "::1" || /^f[cd]/.test(lower) || /^fe[89ab]/.test(lower);
  }
  return true;
}

async function assertPublic(url: URL): Promise<void> {
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("The page must be a web address.");
  // Local testing only: lets a page served on this machine be read.
  if (process.env.FORM_PAGE_ALLOW_PRIVATE === "1") return;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    throw new Error("That address isn't a public web page.");
  }
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (addresses.length === 0) throw new Error("That website couldn't be found.");
  if (addresses.some((entry) => privateAddress(entry.address))) throw new Error("That address isn't a public web page.");
}

async function readCapped(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** The page's HTML. Throws an Error with a message fit to show. */
export async function fetchPublicPage(address: string): Promise<string> {
  let url = new URL(address);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublic(url);
    let response: Response;
    try {
      response = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { Accept: "text/html", "User-Agent": "QuolumeMarketing/1.0 (+https://marketing.quolume.com)" },
      });
    } catch {
      throw new Error("The page didn't answer in time.");
    }
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      url = new URL(location, url);
      continue;
    }
    if (!response.ok) throw new Error(`The page answered with an error (${response.status}).`);
    const type = response.headers.get("content-type") ?? "";
    if (type && !type.includes("html")) throw new Error("That address isn't a web page.");
    return readCapped(response);
  }
  throw new Error("The page redirects too many times.");
}

export type PageReadResult = { ok: true; questions: number; withOptions: number } | { ok: false; error: string };

/** Reads the form's page now and saves what it finds. */
export async function readFormPage(formId: string): Promise<PageReadResult> {
  const form = await db.form.findUnique({
    where: { id: formId },
    select: { id: true, publicId: true, pageUrl: true, pageUrlManual: true, fields: true },
  });
  if (!form?.pageUrl) return { ok: false, error: "No page set for this form yet." };

  let scanned;
  try {
    const html = await fetchPublicPage(form.pageUrl);
    // An address taken from a visitor's browser must be a page that sends to this form.
    scanned = scanFormHtml(html, form.publicId, !form.pageUrlManual);
  } catch (error) {
    await db.form.update({ where: { id: form.id }, data: { pageScannedAt: new Date() } });
    return { ok: false, error: error instanceof Error ? error.message : "The page couldn't be read." };
  }

  if (!scanned) {
    await db.form.update({ where: { id: form.id }, data: { pageScannedAt: new Date() } });
    return { ok: false, error: "This form wasn't found on that page." };
  }
  const merged = mergeScannedFields(parseFields(form.fields), scanned);
  await db.form.update({
    where: { id: form.id },
    data: { pageScannedAt: new Date(), ...(merged ? { fields: JSON.stringify(merged) } : {}) },
  });
  return { ok: true, questions: scanned.length, withOptions: scanned.filter((field) => field.options.length > 0).length };
}

/**
 * Re-reads any of these forms whose page hasn't been read lately, all at
 * once and for a few seconds at most, so opening a condition shows today's
 * options without making the page slow.
 */
export async function refreshStalePages(formIds: string[], budgetMs = 6_000): Promise<void> {
  if (formIds.length === 0) return;
  const stale = await db.form.findMany({
    where: {
      id: { in: formIds },
      pageUrl: { not: null },
      OR: [{ pageScannedAt: null }, { pageScannedAt: { lt: new Date(Date.now() - PAGE_STALE_MS) } }],
    },
    select: { id: true },
  });
  if (stale.length === 0) return;
  const reads = Promise.all(
    stale.map((form) =>
      readFormPage(form.id).catch((error) => console.error("[forms] reading the form page failed", form.id, error)),
    ),
  );
  await Promise.race([reads, new Promise((resolve) => setTimeout(resolve, budgetMs))]);
}
