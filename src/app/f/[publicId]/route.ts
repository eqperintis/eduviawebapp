import { after } from "next/server";
import { db } from "@/lib/db";
import { ensureDatabase } from "@/lib/migrate";
import { pickClientIp } from "@/lib/client-ip";
import { checkPublicFormRateLimit } from "@/lib/rate-limit";
import { extractEmail, extractName, isEmail, learnFields, parseFields } from "@/lib/forms/fields";
import { parseSubmissionBody, SubmissionError, wantsJson } from "@/lib/forms/parse";
import { hostAllowed, httpUrl, nextUrlAllowed, pageUrlFromReferrer, parseDomainList, sourceHost } from "@/lib/forms/origin";
import { refreshStalePages } from "@/lib/forms/page-read";
import { brandPage } from "@/lib/forms/pages";
import { notifyOwner } from "@/lib/forms/notify";
import { startAutomationRuns } from "@/lib/automations/engine";

/**
 * The form endpoint, Formspree-style. eduvia.my keeps its own form
 * and points it here:
 *
 *   <form action="https://marketing.eduvia.my/f/<id>" method="POST">
 *
 * or posts JSON with fetch(). Answers are stored, the owner is emailed, the
 * form's automations start, and the visitor is redirected (HTML) or gets
 * { ok, next } back (JSON).
 */

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ publicId: string }> };

function corsHeaders(request: Request, allowed: string[]): Record<string, string> {
  const origin = request.headers.get("origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (allowed.length === 0) headers["Access-Control-Allow-Origin"] = "*";
  else if (origin && hostAllowed(origin, allowed)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function html(body: string, status: number, extra: Record<string, string> = {}): Response {
  return new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8", ...extra } });
}

async function loadForm(publicId: string) {
  await ensureDatabase();
  return db.form.findUnique({ where: { publicId } });
}

export async function OPTIONS(request: Request, ctx: Ctx): Promise<Response> {
  const { publicId } = await ctx.params;
  const form = await loadForm(publicId).catch(() => null);
  return new Response(null, { status: 204, headers: corsHeaders(request, parseDomainList(form?.allowedDomains)) });
}

export async function GET(_request: Request, ctx: Ctx): Promise<Response> {
  const { publicId } = await ctx.params;
  const form = await loadForm(publicId);
  if (!form) return html(brandPage({ title: "Form not found.", message: "This form link doesn't exist." }), 404);
  return html(
    brandPage({
      title: "This is a form endpoint.",
      message: "Forms on your website send their answers here. There's nothing to fill in on this page.",
    }),
    200,
  );
}

export async function POST(request: Request, ctx: Ctx): Promise<Response> {
  const { publicId } = await ctx.params;
  const json = wantsJson(request);
  const form = await loadForm(publicId);
  const allowed = parseDomainList(form?.allowedDomains);
  const cors = corsHeaders(request, allowed);
  const fromHost = sourceHost(request.headers);
  const referrer = request.headers.get("referer") ?? "";
  const backUrl = httpUrl(referrer)?.toString() ?? null;

  const fail = (status: number, message: string) =>
    json
      ? // `errors` is Formspree's shape, so a form written for Formspree shows the message too.
        Response.json({ ok: false, error: message, errors: [{ message }] }, { status, headers: cors })
      : html(brandPage({ title: "That didn't go through.", message, backUrl }), status, cors);

  if (!form) return fail(404, "This form doesn't exist.");
  if (form.status !== "active") return fail(403, "This form isn't taking submissions right now.");
  if (allowed.length > 0 && !hostAllowed(fromHost, allowed)) {
    return fail(403, "This form only accepts submissions from its own website.");
  }

  let parsed;
  try {
    parsed = await parseSubmissionBody(request);
  } catch (error) {
    if (error instanceof SubmissionError) return fail(error.status, error.message);
    throw error;
  }
  const { data, meta } = parsed;

  // Where a plain HTML submit goes afterwards (a JSON caller decides itself).
  const nextFromForm = nextUrlAllowed(meta.next, allowed, fromHost);
  const thanksUrl = `/f/${encodeURIComponent(form.publicId)}/thanks${backUrl ? `?back=${encodeURIComponent(backUrl)}` : ""}`;
  const respondOk = (next: string | null) =>
    json
      ? Response.json({ ok: true, next }, { headers: cors })
      : new Response(null, { status: 303, headers: { ...cors, Location: next ?? thanksUrl } });

  // A filled honeypot: act as if it worked so the bot learns nothing, store nothing.
  if (meta.spam) return respondOk(nextFromForm ?? (httpUrl(form.redirectUrl)?.toString() || null));

  if (Object.keys(data).length === 0) return fail(400, "The form was empty.");

  const limit = await checkPublicFormRateLimit(`form:${form.id}`);
  if (!limit.ok) return fail(429, limit.error);

  const email = extractEmail(data) || (isEmail(meta.replyTo) ? meta.replyTo : "");
  const name = extractName(data);
  const submittedAt = new Date();

  const submission = await db.formSubmission.create({
    data: {
      formId: form.id,
      data: JSON.stringify(data),
      email,
      name,
      referrer: referrer.slice(0, 500),
      ip: pickClientIp(request.headers),
      userAgent: (request.headers.get("user-agent") ?? "").slice(0, 500),
      createdAt: submittedAt,
    },
  });

  const learned = learnFields(parseFields(form.fields), data);
  if (learned) {
    await db.form
      .update({ where: { id: form.id }, data: { fields: JSON.stringify(learned) } })
      .catch((error) => console.error("[forms] learning fields failed", error));
  }

  // Remember the page the form is on (unless one was set by hand), then
  // read it for every option its questions offer, after responding.
  const page = pageUrlFromReferrer(referrer);
  if (!form.pageUrlManual && page && page !== form.pageUrl && (allowed.length === 0 || hostAllowed(page, allowed))) {
    await db.form
      .update({ where: { id: form.id }, data: { pageUrl: page, pageScannedAt: null } })
      .catch((error) => console.error("[forms] saving the form page failed", error));
  }
  after(() => refreshStalePages([form.id], 15_000));

  notifyOwner({ form, submissionId: submission.id, email, name, answers: data, subject: meta.subject, submittedAt }).catch(
    (error) => console.error("[forms] notify failed", error),
  );

  const { redirectUrl } = await startAutomationRuns({
    formId: form.id,
    formPublicId: form.publicId,
    submissionId: submission.id,
    email,
    name,
    answers: data,
    submittedAt,
  });

  // An automation's Redirect wins (it can depend on their answers), then the
  // form's own _next, then the form's default, then the hosted thank-you page.
  return respondOk(redirectUrl ?? nextFromForm ?? (httpUrl(form.redirectUrl)?.toString() || null));
}
