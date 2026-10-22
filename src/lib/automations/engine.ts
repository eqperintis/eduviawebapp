import "server-only";
import { randomBytes } from "crypto";
import type { AutomationNode, AutomationRun, Form } from "@prisma/client";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email/send";
import { fillText, type TemplateContext } from "@/lib/email/render";
import { composeStepEmail } from "@/lib/automations/compose-email";
import { evaluateCondition } from "@/lib/automations/conditions";
import { findSubmitRedirect } from "@/lib/automations/submit-redirect";
import { SUBMITTED_FORM_FIELD_KEY } from "@/lib/automations/triggers";
import { displayValue, isEmail, parseFields } from "@/lib/forms/fields";
import { httpUrl } from "@/lib/forms/origin";
import { appendRowToSheet, extractSpreadsheetId } from "@/lib/google/sheets";
import { parseColumns } from "@/lib/automations/sheet-columns";
import { formatKL } from "@/lib/tz";

/**
 * Runs the automations. Ported from SEKOOL: there's no job queue, so a run
 * stores the step it's waiting on plus nextRunAt, and /api/cron/automations
 * advances whichever runs have come due.
 */

const MAX_STEPS_PER_PASS = 50;

// While a pass is working on a run, its nextRunAt sits this far ahead so no
// other pass (a cron tick, the submit-time kick-off) picks it up and sends
// the same email twice. A pass that dies mid-way is retried after this.
const RUN_CLAIM_MS = 5 * 60_000;

const WEBHOOK_TIMEOUT_MS = 10_000;

function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

async function logEvent(runId: string, nodeId: string | null, status: "ok" | "skipped" | "failed", message: string) {
  await db.automationEvent.create({ data: { runId, nodeId, status, message: message.slice(0, 2000) } });
}

async function childOf(nodeId: string, branch: string): Promise<AutomationNode | null> {
  return db.automationNode.findFirst({ where: { parentId: nodeId, branch } });
}

async function endRun(runId: string, status: "completed" | "stopped" | "failed"): Promise<void> {
  await db.automationRun.update({
    where: { id: runId },
    data: { status, currentNodeId: null, nextRunAt: null, endedAt: new Date() },
  });
}

function splitAddresses(raw: string | null | undefined): string[] {
  return [...new Set((raw ?? "").split(/[\s,;]+/).map((entry) => entry.trim()).filter(isEmail))];
}

/** Everything a step needs to fill in its text, worked out once per pass. */
type RunContext = {
  run: AutomationRun;
  form: Form | null;
  template: TemplateContext;
  triggerData: Record<string, unknown>;
};

async function buildContext(run: AutomationRun): Promise<RunContext> {
  const triggerData = JSON.parse(run.triggerData) as Record<string, unknown>;
  const publicId = typeof triggerData[SUBMITTED_FORM_FIELD_KEY] === "string" ? triggerData[SUBMITTED_FORM_FIELD_KEY] : "";
  const form = publicId ? await db.form.findUnique({ where: { publicId: publicId as string } }) : null;

  const answers = Object.fromEntries(Object.entries(triggerData).filter(([key]) => !key.startsWith("_")));
  const labels = Object.fromEntries(parseFields(form?.fields).map((field) => [field.key, field.label]));

  return {
    run,
    form,
    triggerData,
    template: {
      name: run.name,
      email: run.email,
      formName: form?.name ?? "your form",
      submittedAt: formatKL(run.startedAt),
      answers,
      labels,
    },
  };
}

/** The person's unsubscribe link, minting the token on first send. */
async function unsubscribeUrl(submissionId: string | null): Promise<string | null> {
  if (!submissionId) return null;
  const submission = await db.formSubmission.findUnique({
    where: { id: submissionId },
    select: { emailOptOutToken: true },
  });
  if (!submission) return null;
  let token = submission.emailOptOutToken;
  if (!token) {
    token = randomBytes(24).toString("base64url");
    await db.formSubmission.update({ where: { id: submissionId }, data: { emailOptOutToken: token } });
  }
  return `${appUrl()}/u/${token}`;
}

/** Opted out on any form counts: it's the person who said stop, not the submission. */
async function hasOptedOut(email: string): Promise<boolean> {
  if (!email) return false;
  const found = await db.formSubmission.findFirst({
    where: { email, emailOptOutAt: { not: null } },
    select: { id: true },
  });
  return !!found;
}

async function runSendEmail(node: AutomationNode, ctx: RunContext): Promise<void> {
  const { run } = ctx;
  if (!run.email) return logEvent(run.id, node.id, "skipped", "No email address on this submission.");
  if (!node.subject || !node.content) return logEvent(run.id, node.id, "skipped", "This email isn't written yet.");
  if (await hasOptedOut(run.email)) return logEvent(run.id, node.id, "skipped", `${run.email} has unsubscribed.`);

  const { subject, html } = composeStepEmail(node, ctx.template, await unsubscribeUrl(run.submissionId));

  const result = await sendEmail({ to: run.email, subject, html });
  if (result.status === "sent") return logEvent(run.id, node.id, "ok", `Emailed ${run.email}.`);
  if (result.status === "not_configured") return logEvent(run.id, node.id, "failed", "Email sending isn't set up yet (EMAIL_PROVIDER).");
  return logEvent(run.id, node.id, "failed", `Email to ${run.email} failed: ${result.error}`);
}

async function runNotify(node: AutomationNode, ctx: RunContext): Promise<void> {
  const { run } = ctx;
  const to = splitAddresses(node.recipients);
  if (to.length === 0) return logEvent(run.id, node.id, "skipped", "No team addresses set.");

  const { subject, html } = composeStepEmail(node, ctx.template, null);

  const results = await Promise.all(
    to.map((address) =>
      sendEmail({ to: address, subject, html, replyTo: run.email || undefined }),
    ),
  );
  const failed = results.filter((result) => result.status !== "sent");
  if (failed.length === 0) return logEvent(run.id, node.id, "ok", `Alerted ${to.join(", ")}.`);
  if (failed.every((result) => result.status === "not_configured")) {
    return logEvent(run.id, node.id, "failed", "Email sending isn't set up yet (EMAIL_PROVIDER).");
  }
  return logEvent(run.id, node.id, "failed", `Alert failed for ${failed.length} of ${to.length} addresses.`);
}

/**
 * Adds the submission as one row, each value in the column the step maps it
 * to (a column the sheet doesn't have yet is added to row 1 first). A step
 * saved before columns could be mapped falls back to every answer in its
 * own column.
 */
async function runGoogleSheet(node: AutomationNode, ctx: RunContext): Promise<void> {
  const { run } = ctx;
  const spreadsheetId = extractSpreadsheetId(node.url ?? "");
  if (!spreadsheetId) return logEvent(run.id, node.id, "skipped", "No spreadsheet chosen.");
  const tab = node.ctaLabel || "Sheet1";

  const mapped = parseColumns(node.content);
  const row = mapped.length
    ? mapped.map((column) => ({ header: column.header, value: fillText(column.value, ctx.template) }))
    : [
    { header: "Submitted at", value: ctx.template.submittedAt },
    { header: "Name", value: run.name },
    { header: "Email", value: run.email },
    ...Object.entries(ctx.template.answers)
      .filter(([key]) => !["name", "email"].includes(key.toLowerCase()))
      .map(([key, value]) => ({ header: ctx.template.labels?.[key] || key, value: displayValue(value) })),
      ];

  try {
    await appendRowToSheet(spreadsheetId, tab, row);
    return logEvent(run.id, node.id, "ok", `Added a row to ${node.subject || "the spreadsheet"} › ${tab}.`);
  } catch (error) {
    return logEvent(run.id, node.id, "failed", error instanceof Error ? error.message : String(error));
  }
}

/** Hosts a webhook may never point at: this server and private networks. */
function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  return (
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h.endsWith(".internal") ||
    h === "::1" ||
    /^127\./.test(h) ||
    /^10\./.test(h) ||
    /^192\.168\./.test(h) ||
    /^169\.254\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
    /^0\./.test(h) ||
    /^f[cd][0-9a-f]{2}:/.test(h)
  );
}

async function runWebhook(node: AutomationNode, ctx: RunContext): Promise<void> {
  const { run } = ctx;
  const url = httpUrl(node.url);
  if (!url) return logEvent(run.id, node.id, "skipped", "No webhook URL set.");
  if (isPrivateHost(url.hostname)) return logEvent(run.id, node.id, "failed", "Webhooks can't point at private addresses.");

  const payload = {
    event: "form.submitted",
    form: ctx.form ? { id: ctx.form.publicId, name: ctx.form.name } : null,
    submission: {
      id: run.submissionId,
      submittedAt: run.startedAt.toISOString(),
      email: run.email,
      name: run.name,
      data: ctx.template.answers,
    },
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "Eduvia-Marketing/1.0" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
      redirect: "manual",
    });
    if (response.ok) return logEvent(run.id, node.id, "ok", `POSTed to ${url.host} (${response.status}).`);
    return logEvent(run.id, node.id, "failed", `${url.host} answered ${response.status}.`);
  } catch (error) {
    return logEvent(run.id, node.id, "failed", `Couldn't reach ${url.host}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Advances one run as far as it can go right now, stopping at a Wait (and
 * scheduling itself) or at the end of the flow. Re-checks the automation's
 * status first, so pausing an automation holds its runs where they are.
 */
export async function advanceRun(runId: string): Promise<void> {
  const run = await db.automationRun.findUnique({ where: { id: runId }, include: { automation: true } });
  if (!run || run.status !== "active" || run.automation.status !== "active") return;

  const claimed = await db.automationRun.updateMany({
    where: { id: runId, status: "active", OR: [{ nextRunAt: null }, { nextRunAt: { lte: new Date() } }] },
    data: { nextRunAt: new Date(Date.now() + RUN_CLAIM_MS) },
  });
  if (claimed.count === 0) return;

  const ctx = await buildContext(run);
  let currentNodeId = run.currentNodeId;

  for (let step = 0; step < MAX_STEPS_PER_PASS; step += 1) {
    if (!currentNodeId) {
      await endRun(runId, "completed");
      return;
    }
    const node = await db.automationNode.findUnique({ where: { id: currentNodeId } });
    if (!node) {
      // The step was deleted while this run was waiting on it.
      await endRun(runId, "completed");
      return;
    }

    if (node.type === "wait") {
      const next = await childOf(node.id, "main");
      const minutes = node.delayMinutes ?? 0;
      await logEvent(runId, node.id, "ok", `Waiting ${minutes} minute${minutes === 1 ? "" : "s"}.`);
      await db.automationRun.update({
        where: { id: runId },
        data: { currentNodeId: next?.id ?? null, nextRunAt: new Date(Date.now() + minutes * 60_000) },
      });
      return;
    }

    if (node.type === "condition") {
      const matched =
        !!node.conditionField &&
        !!node.conditionOperator &&
        evaluateCondition({
          field: node.conditionField,
          operator: node.conditionOperator,
          value: node.conditionValue,
          triggerData: ctx.triggerData,
        });
      await logEvent(runId, node.id, "ok", matched ? "Condition matched: took Yes." : "Condition didn't match: took No.");
      currentNodeId = (await childOf(node.id, matched ? "yes" : "no"))?.id ?? null;
      continue;
    }

    try {
      if (node.type === "send_email") await runSendEmail(node, ctx);
      else if (node.type === "notify") await runNotify(node, ctx);
      else if (node.type === "webhook") await runWebhook(node, ctx);
      else if (node.type === "google_sheets") await runGoogleSheet(node, ctx);
      else if (node.type === "redirect") await logEvent(runId, node.id, "ok", "Redirect handled when they submitted.");
    } catch (error) {
      // One broken step must not stall the run.
      console.error("[automations] step failed", error);
      await logEvent(runId, node.id, "failed", error instanceof Error ? error.message : String(error));
    }

    currentNodeId = (await childOf(node.id, "main"))?.id ?? null;
    await db.automationRun.update({
      where: { id: runId },
      data: { currentNodeId, nextRunAt: currentNodeId ? new Date(Date.now() + RUN_CLAIM_MS) : null },
    });
  }

  // Hit the step ceiling: park the run rather than loop forever.
  await db.automationRun.update({ where: { id: runId }, data: { nextRunAt: new Date(Date.now() + 60_000) } });
}

/**
 * Starts a run of every active automation listening to this form, and works
 * out where the person should be redirected (if a Redirect step is reached
 * straight away). Never throws: an automation problem must not lose the
 * submission.
 */
export async function startAutomationRuns(args: {
  formId: string;
  formPublicId: string;
  submissionId: string;
  email: string;
  name: string;
  answers: Record<string, unknown>;
  submittedAt: Date;
}): Promise<{ redirectUrl: string | null }> {
  let redirectUrl: string | null = null;
  try {
    const triggerData = {
      ...args.answers,
      [SUBMITTED_FORM_FIELD_KEY]: args.formPublicId,
      _email: args.email,
      _name: args.name,
      _submitted_at: args.submittedAt.toISOString(),
    };

    const automations = await db.automation.findMany({
      where: { status: "active", triggers: { some: { formId: args.formId } } },
      include: { nodes: true },
    });

    for (const automation of automations) {
      const trigger = automation.nodes.find((node) => node.type === "trigger");
      if (!trigger) continue;
      const first = automation.nodes.find((node) => node.parentId === trigger.id && node.branch === "main");
      if (!first) continue;

      if (!redirectUrl) {
        const found = findSubmitRedirect(automation.nodes, trigger.id, triggerData);
        redirectUrl = httpUrl(found)?.toString() ?? null;
      }

      const run = await db.automationRun.create({
        data: {
          automationId: automation.id,
          submissionId: args.submissionId,
          email: args.email,
          name: args.name,
          triggerData: JSON.stringify(triggerData),
          currentNodeId: first.id,
          nextRunAt: new Date(),
        },
      });
      // Not awaited: the visitor's response shouldn't wait on an email send.
      advanceRun(run.id).catch((error) => console.error("[automations] advanceRun failed", error));
    }
  } catch (error) {
    console.error("[automations] failed to start runs", error);
  }
  return { redirectUrl };
}

/** Advances every run that has come due. Called by the cron route. */
export async function advanceDueRuns(limit = 100): Promise<number> {
  const due = await db.automationRun.findMany({
    where: { status: "active", nextRunAt: { lte: new Date() }, automation: { status: "active" } },
    orderBy: { nextRunAt: "asc" },
    take: limit,
    select: { id: true },
  });
  for (const { id } of due) {
    try {
      await advanceRun(id);
    } catch (error) {
      console.error("[automations] cron advance failed", id, error);
    }
  }
  return due.length;
}
