import { brandEmailHtml, buttonHtml, fillText, type TemplateContext } from "@/lib/email/render";
import { renderEmailBody } from "@/lib/email/rich-render";
import { httpUrl } from "@/lib/forms/origin";

/**
 * The email an Email or Team-alert step sends, from its fields and one
 * submission's answers. Shared by the automation engine and "Send me a
 * test", so a test looks exactly like the real thing.
 */

export type EmailStep = {
  type: string;
  subject: string | null;
  content: string | null;
  ctaLabel: string | null;
  url: string | null;
};

export const NOTIFY_SUBJECT = "New submission: {{form_name}}";
export const NOTIFY_BODY = "<p>{{name}} just filled in {{form_name}}.</p><p>{{answers}}</p>";

export function composeStepEmail(
  step: EmailStep,
  template: TemplateContext,
  unsubscribeUrl: string | null,
): { subject: string; html: string } {
  if (step.type === "notify") {
    return {
      subject: fillText(step.subject || NOTIFY_SUBJECT, template),
      html: brandEmailHtml({
        bodyHtml: renderEmailBody(step.content || NOTIFY_BODY, template),
        footer: "Sent by your Eduvia automation.",
      }),
    };
  }
  const ctaUrl = step.url ? fillText(step.url, template).trim() : "";
  const cta = step.ctaLabel && httpUrl(ctaUrl) ? buttonHtml(ctaUrl, fillText(step.ctaLabel, template)) : "";
  return {
    subject: fillText(step.subject ?? "", template),
    html: brandEmailHtml({
      bodyHtml: renderEmailBody(step.content ?? "", template) + cta,
      footer: "You're receiving this because you filled in a form on eduvia.my.",
      unsubscribeUrl,
    }),
  };
}
