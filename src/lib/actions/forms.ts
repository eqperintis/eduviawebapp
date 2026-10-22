"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { newPublicId } from "@/lib/migrate";
import { isEmail } from "@/lib/forms/fields";
import { httpUrl, pageUrlFromReferrer, parseDomainList } from "@/lib/forms/origin";
import { readFormPage } from "@/lib/forms/page-read";
import type { FormState } from "@/lib/actions/auth";

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

export async function createFormAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const name = text(formData, "name");
  if (!name) return { error: "Give the form a name." };
  if (name.length > 120) return { error: "Keep the name under 120 characters." };

  const form = await db.form.create({
    data: { name, publicId: newPublicId(), notifyEmails: user.email },
  });
  redirect(`/forms/${form.id}?tab=integration`);
}

export async function updateFormSettingsAction(formId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const name = text(formData, "name");
  if (!name) return { error: "Give the form a name." };

  const notifyEmails = text(formData, "notifyEmails");
  const bad = notifyEmails.split(/[\s,;]+/).filter((entry) => entry && !isEmail(entry));
  if (bad.length) return { error: `Not an email address: ${bad.join(", ")}` };

  const redirectUrl = text(formData, "redirectUrl");
  if (redirectUrl && !httpUrl(redirectUrl)) return { error: "The redirect must be a full link starting with https://" };

  const allowedDomains = parseDomainList(text(formData, "allowedDomains")).join("\n");

  const pageText = text(formData, "pageUrl");
  const pageUrl = pageText ? pageUrlFromReferrer(pageText) : null;
  if (pageText && !pageUrl) return { error: "The form's page must be a full link starting with https://" };
  const before = await db.form.findUnique({ where: { id: formId }, select: { pageUrl: true } });
  const pageChanged = (before?.pageUrl ?? null) !== pageUrl;

  await db.form.update({
    where: { id: formId },
    data: {
      name: name.slice(0, 120),
      status: formData.get("status") === "paused" ? "paused" : "active",
      notifyEnabled: formData.get("notifyEnabled") === "on",
      notifyEmails,
      allowedDomains,
      redirectUrl,
      successTitle: text(formData, "successTitle").slice(0, 120) || "Thank you.",
      successMessage: text(formData, "successMessage").slice(0, 2000),
      // Typed in here, it stays put; left empty, it's picked up from where submissions come from.
      ...(pageChanged ? { pageUrl, pageUrlManual: !!pageUrl, pageScannedAt: null } : {}),
    },
  });
  revalidatePath(`/forms/${formId}`);
  if (!pageUrl) return { ok: "Saved." };

  const read = await readFormPage(formId);
  revalidatePath(`/forms/${formId}`);
  if (!read.ok) return { error: `Saved, but the form's page couldn't be read: ${read.error}` };
  return {
    ok: `Saved. Read ${read.questions} question${read.questions === 1 ? "" : "s"} from the page, ${read.withOptions} with options to choose from.`,
  };
}

export async function deleteFormAction(formId: string): Promise<void> {
  await requireUser();
  await db.form.delete({ where: { id: formId } });
  redirect("/forms");
}

/** What a bulk action tells the list: a short note, or why it didn't run. */
export type BulkResult = { ok?: string; error?: string };

function cleanIds(ids: string[]): string[] {
  return [...new Set(ids.filter((id) => typeof id === "string" && id))].slice(0, 500);
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** Deletes forms from the list, with their submissions. Automations stay, minus that starting form. */
export async function deleteFormsAction(ids: string[]): Promise<BulkResult> {
  await requireUser();
  const { count } = await db.form.deleteMany({ where: { id: { in: cleanIds(ids) } } });
  revalidatePath("/forms");
  revalidatePath("/automations");
  return { ok: `Deleted ${plural(count, "form")}.` };
}

export async function setFormsStatusAction(status: string, ids: string[]): Promise<BulkResult> {
  await requireUser();
  if (status !== "active" && status !== "paused") return { error: "Unknown status." };
  const { count } = await db.form.updateMany({ where: { id: { in: cleanIds(ids) } }, data: { status } });
  revalidatePath("/forms");
  return { ok: `${status === "active" ? "Turned on" : "Paused"} ${plural(count, "form")}.` };
}

export async function deleteSubmissionsAction(formId: string, ids: string[]): Promise<BulkResult> {
  await requireUser();
  const { count } = await db.formSubmission.deleteMany({ where: { formId, id: { in: cleanIds(ids) } } });
  revalidatePath(`/forms/${formId}`);
  return { ok: `Deleted ${plural(count, "submission")}.` };
}

export async function deleteSubmissionAction(submissionId: string): Promise<void> {
  await requireUser();
  const submission = await db.formSubmission.delete({ where: { id: submissionId } });
  revalidatePath(`/forms/${submission.formId}`);
}
