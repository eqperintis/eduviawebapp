"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { findOperator } from "@/lib/automations/conditions";
import { buildTrigger, fieldOrTyped } from "@/lib/automations/triggers";
import { STEP_TYPES } from "@/lib/automations/flow";
import { isEmail, parseFields } from "@/lib/forms/fields";
import { httpUrl } from "@/lib/forms/origin";
import { extractSpreadsheetId } from "@/lib/google/sheets";
import { parseColumns } from "@/lib/automations/sheet-columns";
import { richTextIsEmpty } from "@/lib/email/rich-text";
import { composeStepEmail } from "@/lib/automations/compose-email";
import { copyAutomation } from "@/lib/automations/duplicate";
import { sendEmail } from "@/lib/email/send";
import type { TemplateContext } from "@/lib/email/render";
import { formatKL } from "@/lib/tz";
import type { FormState } from "@/lib/actions/auth";
import type { BulkResult } from "@/lib/actions/forms";

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

const MAX_WAIT_MINUTES = 60 * 24 * 365;
const MAX_EMAIL_LENGTH = 16_000;

async function loadTrigger(automationId: string) {
  const triggers = await db.automationTrigger.findMany({
    where: { automationId },
    orderBy: { createdAt: "asc" },
    include: { form: { select: { publicId: true, name: true, fields: true } } },
  });
  return buildTrigger(triggers.map((trigger) => trigger.form));
}

async function setTriggers(automationId: string, formIds: string[]): Promise<void> {
  const unique = [...new Set(formIds)];
  const existing = await db.form.findMany({ where: { id: { in: unique } }, select: { id: true } });
  const valid = new Set(existing.map((form) => form.id));
  await db.automationTrigger.deleteMany({ where: { automationId, formId: { notIn: [...valid] } } });
  for (const formId of unique.filter((id) => valid.has(id))) {
    await db.automationTrigger.upsert({
      where: { automationId_formId: { automationId, formId } },
      create: { automationId, formId },
      update: {},
    });
  }
}

export async function createAutomationAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  const formIds = formData.getAll("formIds").map(String).filter(Boolean);
  if (!name) return { error: "Give the automation a name." };
  if (formIds.length === 0) return { error: "Pick at least one form to start it." };

  const automation = await db.automation.create({
    data: { name: name.slice(0, 120), nodes: { create: { type: "trigger" } } },
  });
  await setTriggers(automation.id, formIds);
  redirect(`/automations/${automation.id}`);
}

/** Copies the whole flow under a new name, started by the same forms. The copy is a draft. */
export async function duplicateAutomationAction(automationId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Give the copy a name." };
  const source = await db.automation.findUnique({ where: { id: automationId }, include: { triggers: { select: { formId: true } } } });
  if (!source) return { error: "That automation no longer exists." };

  const id = await db.$transaction((tx) => copyAutomation(tx, source.id, name, source.triggers.map((trigger) => trigger.formId)));
  revalidatePath("/automations");
  redirect(`/automations/${id}`);
}

export async function updateAutomationAction(
  automationId: string,
  input: { name: string; formIds: string[] },
): Promise<ActionResult> {
  await requireUser();
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Give the automation a name." };
  if (input.formIds.length === 0) return { ok: false, error: "Pick at least one form." };
  await db.automation.update({ where: { id: automationId }, data: { name: name.slice(0, 120) } });
  await setTriggers(automationId, input.formIds);
  revalidatePath(`/automations/${automationId}`);
  return { ok: true };
}

/** Why an automation can't be turned on yet, or null if it can. */
async function cannotActivate(automationId: string): Promise<string | null> {
  const [triggers, steps] = await Promise.all([
    db.automationTrigger.count({ where: { automationId } }),
    db.automationNode.count({ where: { automationId, type: { not: "trigger" } } }),
  ]);
  if (triggers === 0) return "Pick a form to start it first.";
  if (steps === 0) return "Add at least one step first.";
  return null;
}

export async function setAutomationStatusAction(automationId: string, status: string): Promise<ActionResult> {
  await requireUser();
  if (!["draft", "active", "paused"].includes(status)) return { ok: false, error: "Unknown status." };
  if (status === "active") {
    const reason = await cannotActivate(automationId);
    if (reason) return { ok: false, error: reason };
  }
  await db.automation.update({ where: { id: automationId }, data: { status } });
  revalidatePath(`/automations/${automationId}`);
  revalidatePath("/automations");
  return { ok: true };
}

export async function deleteAutomationAction(automationId: string): Promise<void> {
  await requireUser();
  // The trigger node's children cascade with it.
  await db.automation.delete({ where: { id: automationId } });
  redirect("/automations");
}

function plural(count: number): string {
  return `${count} automation${count === 1 ? "" : "s"}`;
}

export async function deleteAutomationsAction(ids: string[]): Promise<BulkResult> {
  await requireUser();
  const { count } = await db.automation.deleteMany({ where: { id: { in: [...new Set(ids)].slice(0, 500) } } });
  revalidatePath("/automations");
  return { ok: `Deleted ${plural(count)}.` };
}

/** Turns several on or pauses them. One that isn't ready to run (no form or no steps) is left as it is. */
export async function setAutomationsStatusAction(status: string, ids: string[]): Promise<BulkResult> {
  await requireUser();
  if (status !== "active" && status !== "paused") return { error: "Unknown status." };
  const unique = [...new Set(ids)].slice(0, 500);
  let ready = unique;
  if (status === "active") {
    const checks = await Promise.all(unique.map(async (id) => ((await cannotActivate(id)) ? null : id)));
    ready = checks.filter((id): id is string => !!id);
  }
  const { count } = await db.automation.updateMany({ where: { id: { in: ready } }, data: { status } });
  revalidatePath("/automations");
  const skipped = unique.length - ready.length;
  const done = `${status === "active" ? "Turned on" : "Paused"} ${plural(count)}.`;
  if (skipped === 0) return { ok: done };
  const why = `${skipped === 1 ? "It needs" : "They need"} a form and at least one step first.`;
  return count === 0
    ? { error: `Nothing turned on. ${why}` }
    : { ok: `${done} ${plural(skipped)} stayed off: ${skipped === 1 ? "it needs" : "they need"} a form and at least one step first.` };
}

/**
 * Inserts a step on a parent's output. Whatever was already hanging there
 * moves under the new step (its Yes branch, for a Condition), so inserting
 * in the middle of a flow never orphans the rest of it.
 */
export async function addStepAction(
  automationId: string,
  parentId: string,
  branch: string,
  type: string,
): Promise<ActionResult> {
  await requireUser();
  if (!STEP_TYPES.some((step) => step.type === type)) return { ok: false, error: "Unknown step." };
  if (!["main", "yes", "no"].includes(branch)) return { ok: false, error: "Unknown branch." };

  const parent = await db.automationNode.findFirst({ where: { id: parentId, automationId } });
  if (!parent) return { ok: false, error: "That step no longer exists." };
  if ((parent.type === "condition") !== (branch !== "main")) return { ok: false, error: "Wrong branch for that step." };

  const id = await db.$transaction(async (tx) => {
    const existing = await tx.automationNode.findFirst({ where: { parentId, branch } });
    const created = await tx.automationNode.create({
      data: {
        automationId,
        type,
        parentId,
        branch,
        ...(type === "wait" ? { delayMinutes: 60 * 24 } : {}),
        ...(type === "notify" ? { subject: "New submission: {{form_name}}", content: "<p>{{name}} just filled in {{form_name}}.</p><p>{{answers}}</p>" } : {}),
        ...(type === "send_email" ? { subject: "Thanks, {{name}}", content: "<p>Hi {{name}},</p><p>Thanks for filling in the form. We'll get back to you soon.</p><p>Eduvia</p>" } : {}),
      },
    });
    if (existing) {
      await tx.automationNode.update({
        where: { id: existing.id },
        data: { parentId: created.id, branch: type === "condition" ? "yes" : "main" },
      });
    }
    return created.id;
  });

  revalidatePath(`/automations/${automationId}`);
  return { ok: true, id };
}

export type StepInput = {
  recipients?: string;
  subject?: string;
  content?: string;
  ctaLabel?: string;
  url?: string;
  delayMinutes?: number;
  conditionField?: string;
  conditionOperator?: string;
  conditionValue?: unknown;
};

export async function updateStepAction(nodeId: string, input: StepInput): Promise<ActionResult> {
  await requireUser();
  const node = await db.automationNode.findUnique({ where: { id: nodeId } });
  if (!node || node.type === "trigger") return { ok: false, error: "That step no longer exists." };

  const data: Record<string, unknown> = {};
  switch (node.type) {
    case "send_email":
    case "notify": {
      const subject = (input.subject ?? "").trim();
      const content = (input.content ?? "").trim();
      if (!subject) return { ok: false, error: "Write a subject line." };
      if (!content || richTextIsEmpty(content)) return { ok: false, error: "Write the email." };
      // The column holds 64KB; at up to 4 bytes a character this always fits.
      if (content.length > MAX_EMAIL_LENGTH) return { ok: false, error: "That email is too long. Shorten it a little." };
      data.subject = subject.slice(0, 190);
      data.content = content;
      if (node.type === "notify") {
        const addresses = (input.recipients ?? "").split(/[\s,;]+/).filter(Boolean);
        if (addresses.length === 0) return { ok: false, error: "Add at least one address." };
        const bad = addresses.filter((address) => !isEmail(address));
        if (bad.length) return { ok: false, error: `Not an email address: ${bad.join(", ")}` };
        data.recipients = addresses.join("\n");
      } else {
        const label = (input.ctaLabel ?? "").trim();
        const url = (input.url ?? "").trim();
        if (label && !url) return { ok: false, error: "Add the button's link, or clear its label." };
        if (url && !url.includes("{{") && !httpUrl(url)) return { ok: false, error: "The button link must start with https://" };
        data.ctaLabel = label.slice(0, 120) || null;
        data.url = url || null;
      }
      break;
    }
    case "redirect":
    case "webhook": {
      const url = httpUrl(input.url);
      if (!url) return { ok: false, error: "Enter a full link starting with https://" };
      data.url = url.toString();
      break;
    }
    case "google_sheets": {
      const url = (input.url ?? "").trim();
      const spreadsheetId = extractSpreadsheetId(url);
      if (!spreadsheetId) return { ok: false, error: "Choose a spreadsheet from Google Drive." };
      const tab = (input.ctaLabel ?? "").trim();
      if (!tab) return { ok: false, error: "Choose which tab to add rows to." };
      // Only columns that get something are kept; an empty choice leaves that column blank.
      const columns = parseColumns(input.content ?? "")
        .map((column) => ({ header: column.header.trim().slice(0, 100), value: column.value.slice(0, 500) }))
        .filter((column) => column.header && column.value.trim());
      if (columns.length === 0) return { ok: false, error: "Choose what goes in at least one column." };
      const headers = columns.map((column) => column.header);
      if (new Set(headers).size !== headers.length) return { ok: false, error: "Two columns have the same name." };
      data.url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
      data.ctaLabel = tab.slice(0, 190);
      data.subject = (input.subject ?? "").trim().slice(0, 190) || null;
      data.content = JSON.stringify(columns);
      break;
    }
    case "wait": {
      const minutes = Math.round(Number(input.delayMinutes));
      if (!Number.isFinite(minutes) || minutes < 1) return { ok: false, error: "Wait at least 1 minute." };
      if (minutes > MAX_WAIT_MINUTES) return { ok: false, error: "Wait at most a year." };
      data.delayMinutes = minutes;
      break;
    }
    case "condition": {
      const trigger = await loadTrigger(node.automationId);
      const field = input.conditionField ? fieldOrTyped(trigger, input.conditionField) : undefined;
      if (!field) return { ok: false, error: "Pick a field, or type its name exactly as the form sends it." };
      const operator = findOperator(field, input.conditionOperator ?? "");
      if (!operator) return { ok: false, error: "Pick how to compare it." };
      let value: unknown = null;
      if (operator.operands > 0) {
        const values = (Array.isArray(input.conditionValue) ? input.conditionValue : [input.conditionValue])
          .map((entry) => String(entry ?? "").trim())
          .filter(Boolean);
        if (values.length < (operator.operands === 2 ? 2 : 1)) return { ok: false, error: "Fill in what to compare against." };
        value = operator.operands === 2 || operator.multiSelect ? values : values[0];
      }
      data.conditionField = field.key;
      data.conditionOperator = operator.value;
      data.conditionValue = value === null ? null : JSON.stringify(value);
      break;
    }
  }

  await db.automationNode.update({ where: { id: nodeId }, data });
  revalidatePath(`/automations/${node.automationId}`);
  return { ok: true };
}

/**
 * Removes a step. Its next step moves up into its place. A Condition takes
 * both of its branches with it, since there's no single place to put two
 * paths.
 */
export async function deleteStepAction(nodeId: string): Promise<ActionResult> {
  await requireUser();
  const node = await db.automationNode.findUnique({ where: { id: nodeId } });
  if (!node || node.type === "trigger" || !node.parentId) return { ok: false, error: "That step can't be removed." };

  await db.$transaction(async (tx) => {
    if (node.type !== "condition") {
      const child = await tx.automationNode.findFirst({ where: { parentId: node.id, branch: "main" } });
      if (child) {
        // Move the child up first (on a temporary branch, so it doesn't clash
        // with this node's slot) so deleting this node doesn't cascade into it.
        await tx.automationNode.update({ where: { id: child.id }, data: { parentId: node.parentId, branch: `moving:${node.id}` } });
        await tx.automationNode.delete({ where: { id: node.id } });
        await tx.automationNode.update({ where: { id: child.id }, data: { branch: node.branch } });
        return;
      }
    }
    await tx.automationNode.delete({ where: { id: node.id } });
  });

  revalidatePath(`/automations/${node.automationId}`);
  return { ok: true };
}

/**
 * Sends the step's email, as it is in the editor right now (saved or not),
 * to the signed-in user, filled in with the latest real submission from a
 * form that starts this automation, or sample answers if there is none yet.
 */
export async function sendTestEmailAction(
  nodeId: string,
  input: { subject: string; content: string; ctaLabel: string; url: string },
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const user = await requireUser();
  const node = await db.automationNode.findUnique({ where: { id: nodeId } });
  if (!node || (node.type !== "send_email" && node.type !== "notify")) return { ok: false, error: "That step isn't an email." };
  if (!input.subject.trim()) return { ok: false, error: "Write a subject line first." };
  if (richTextIsEmpty(input.content)) return { ok: false, error: "Write the email first." };

  const triggers = await db.automationTrigger.findMany({
    where: { automationId: node.automationId },
    include: { form: { select: { id: true, name: true, fields: true } } },
  });
  const forms = triggers.map((trigger) => trigger.form);
  const submission = await db.formSubmission.findFirst({
    where: { formId: { in: forms.map((form) => form.id) } },
    orderBy: { createdAt: "desc" },
  });
  const form = forms.find((entry) => entry.id === submission?.formId) ?? forms[0];
  const fields = parseFields(form?.fields);

  let template: TemplateContext;
  if (submission) {
    const data = JSON.parse(submission.data) as Record<string, unknown>;
    template = {
      name: submission.name,
      email: submission.email,
      formName: form?.name ?? "your form",
      submittedAt: formatKL(submission.createdAt),
      answers: Object.fromEntries(Object.entries(data).filter(([key]) => !key.startsWith("_"))),
      labels: Object.fromEntries(fields.map((field) => [field.key, field.label])),
    };
  } else {
    template = {
      name: "Aisyah",
      email: user.email,
      formName: form?.name ?? "your form",
      submittedAt: formatKL(new Date()),
      answers: Object.fromEntries(
        fields.filter((field) => !field.key.startsWith("_")).map((field) => [field.key, field.options?.[0] ?? `(${field.label})`]),
      ),
      labels: Object.fromEntries(fields.map((field) => [field.key, field.label])),
    };
  }

  const { subject, html } = composeStepEmail(
    { type: node.type, subject: input.subject, content: input.content, ctaLabel: input.ctaLabel, url: input.url },
    template,
    null,
  );
  const result = await sendEmail({ to: user.email, subject: `[Test] ${subject}`, html });
  if (result.status === "not_configured") return { ok: false, error: "Email sending isn't set up on the server yet." };
  if (result.status === "failed") return { ok: false, error: `The test didn't send: ${result.error}` };
  const source = submission ? `${submission.name || submission.email || "the latest"}'s answers` : "sample answers";
  return { ok: true, text: `Test sent to ${user.email}, filled in with ${source}.` };
}
