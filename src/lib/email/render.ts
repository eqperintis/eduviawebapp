import { BRAND, brandAsset, escapeHtml, LOGO, SITE_URL } from "@/lib/brand";
import { displayValue, labelFromKey } from "@/lib/forms/fields";
import { isUtmKey } from "@/lib/forms/utm";

/**
 * Turns an automation step's plain text into the email that gets sent:
 * {{variables}} filled in, wrapped in the Eduvia look (the message, then
 * the logo). Pure, so it can be unit tested.
 */

export type TemplateContext = {
  name: string;
  email: string;
  formName: string;
  submittedAt: string;
  /** The answers, without the app's own "_" keys. */
  answers: Record<string, unknown>;
  /** Field labels by key, for {{answers}}. */
  labels?: Record<string, string>;
  /** Leave UTM tags out of {{answers}}: in an email to the person, "UTM source: facebook" means nothing to them. */
  answersWithoutUtm?: boolean;
};

export function answerRows(ctx: TemplateContext): [string, string][] {
  return Object.entries(ctx.answers)
    .filter(([key]) => !(ctx.answersWithoutUtm && isUtmKey(key)))
    .map(([key, value]) => [ctx.labels?.[key] || labelFromKey(key), displayValue(value)]);
}

export function tokenValue(token: string, ctx: TemplateContext): string | null {
  switch (token) {
    case "name":
      return ctx.name || "there";
    case "email":
      return ctx.email;
    case "form_name":
      return ctx.formName;
    case "submitted_at":
      return ctx.submittedAt;
    default:
      return token in ctx.answers ? displayValue(ctx.answers[token]) : null;
  }
}

const TOKEN = /\{\{\s*([\w\-. ]+?)\s*\}\}/g;

/** Fills {{tokens}} in plain text (subjects, webhook values). Unknown tokens become blank. */
export function fillText(text: string, ctx: TemplateContext): string {
  return text.replace(TOKEN, (_, token: string) => {
    if (token === "answers") return answerRows(ctx).map(([label, value]) => `${label}: ${value}`).join("\n");
    return tokenValue(token, ctx) ?? "";
  });
}

export function answersTableHtml(ctx: TemplateContext): string {
  const rows = answerRows(ctx)
    .map(
      ([label, value]) =>
        `<tr><td style="padding:10px 12px;border-top:1px dashed #DCE2F2;color:${BRAND.muted};font-size:13px;vertical-align:top;width:38%;">${escapeHtml(label)}</td><td style="padding:10px 12px;border-top:1px dashed #DCE2F2;color:${BRAND.ink};font-size:14px;white-space:pre-wrap;">${escapeHtml(value) || "&mdash;"}</td></tr>`,
    )
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;background:${BRAND.bg};border-radius:10px;margin:8px 0 16px;">${rows}</table>`;
}

/** Fills {{tokens}} in the owner's plain-text body and turns it into safe HTML paragraphs. */
export function fillHtml(text: string, ctx: TemplateContext): string {
  const paragraphs = text.replace(/\r\n/g, "\n").split(/\n{2,}/);
  return paragraphs
    .map((paragraph) => {
      if (/^\s*\{\{\s*answers\s*\}\}\s*$/.test(paragraph)) return answersTableHtml(ctx);
      const html = escapeHtml(paragraph)
        .replace(/\{\{\s*([\w\-. ]+?)\s*\}\}/g, (_, token: string) => {
          if (token === "answers") return answersTableHtml(ctx);
          return escapeHtml(tokenValue(token, ctx) ?? "");
        })
        .replace(/\n/g, "<br>");
      return `<p style="margin:0 0 16px;">${html}</p>`;
    })
    .join("");
}

export function buttonHtml(url: string, label: string): string {
  return `<p style="margin:24px 0;"><a href="${escapeHtml(url)}" style="display:inline-block;background:${BRAND.ink};color:${BRAND.onInk};text-decoration:none;font-weight:600;padding:14px 24px;border-radius:999px;">${escapeHtml(label)} &rarr;</a></p>`;
}

export function brandEmailHtml(args: {
  bodyHtml: string;
  /** Small print under the body, e.g. why they got it. */
  footer?: string;
  unsubscribeUrl?: string | null;
}): string {
  const font = `'Plus Jakarta Sans', 'Segoe UI', Helvetica, Arial, sans-serif`;
  const unsubscribe = args.unsubscribeUrl
    ? ` <a href="${escapeHtml(args.unsubscribeUrl)}" style="color:${BRAND.muted};">Unsubscribe</a>`
    : "";
  // One box and nothing around it (no page background, which dark-mode
  // inboxes show as a second panel): the message, then the logo and the
  // small print at the bottom, like a signature.
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px;font-family:${font};">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:${BRAND.paper};border:1.5px solid #D5DBEE;border-radius:18px;">
<tr><td style="padding:28px 28px 8px;color:${BRAND.ink};font-size:15px;line-height:1.6;">${args.bodyHtml}</td></tr>
<tr><td style="padding:0 28px;"><div style="border-top:1.5px dashed #D5DBEE;font-size:0;line-height:0;">&nbsp;</div></td></tr>
<tr><td style="padding:20px 28px 8px;"><a href="${SITE_URL}"><img src="${escapeHtml(brandAsset(LOGO.email))}" alt="${BRAND.name}" width="${LOGO.emailWidth}" height="${LOGO.emailHeight}" style="display:block;border:0;height:${LOGO.emailHeight}px;width:auto;"></a></td></tr>
<tr><td style="padding:4px 28px 24px;color:${BRAND.muted};font-size:12px;line-height:1.5;">${args.footer ? escapeHtml(args.footer) : ""}${unsubscribe}<br>${escapeHtml(BRAND.footerLine)}</td></tr>
</table></td></tr></table></body></html>`;
}
