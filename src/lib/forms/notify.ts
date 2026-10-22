import "server-only";
import type { Form } from "@prisma/client";
import { appUrl } from "@/lib/brand";
import { sendEmail } from "@/lib/email/send";
import { brandEmailHtml, buttonHtml, fillHtml, type TemplateContext } from "@/lib/email/render";
import { isEmail, parseFields } from "@/lib/forms/fields";
import { formatKL } from "@/lib/tz";

/**
 * The Formspree part: email the form's owner every submission, with the
 * answers, Reply-To set to the person, and a Reply button too (not every
 * provider can set Reply-To) so answering is one click.
 */
export async function notifyOwner(args: {
  form: Form;
  submissionId: string;
  email: string;
  name: string;
  answers: Record<string, unknown>;
  subject: string;
  submittedAt: Date;
}): Promise<void> {
  const { form } = args;
  if (!form.notifyEnabled) return;
  const to = [...new Set((form.notifyEmails ?? "").split(/[\s,;]+/).map((entry) => entry.trim()).filter(isEmail))];
  if (to.length === 0) return;

  const ctx: TemplateContext = {
    name: args.name,
    email: args.email,
    formName: form.name,
    submittedAt: formatKL(args.submittedAt),
    answers: args.answers,
    labels: Object.fromEntries(parseFields(form.fields).map((field) => [field.key, field.label])),
  };
  const link = `\n\nSee every submission: ${appUrl()}/forms/${form.id}`;
  const reply = isEmail(args.email)
    ? buttonHtml(`mailto:${args.email}`, `Reply to ${args.name || args.email}`)
    : "";
  const html = brandEmailHtml({
    bodyHtml: fillHtml(`New submission on {{form_name}}, {{submitted_at}}.\n\n{{answers}}${link}`, ctx) + reply,
    footer: `You get this because notifications are on for “${form.name}”.`,
  });
  const subject = args.subject || `New submission: ${form.name}${args.name ? ` from ${args.name}` : ""}`;

  await Promise.all(
    to.map(async (address) => {
      const result = await sendEmail({
        to: address,
        subject,
        html,
        replyTo: args.email || undefined,
      });
      if (result.status === "failed") console.error("[forms] notification failed", address, result.error);
    }),
  );
}
