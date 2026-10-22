import "server-only";
import nodemailer from "nodemailer";

export type EmailAttachment = {
  filename: string;
  content: Buffer;
  contentType: string;
};

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  /** Where a reply goes, e.g. the person who filled in the form. */
  replyTo?: string;
  /** Overrides the From display name (the address stays EMAIL_FROM). */
  fromName?: string;
  attachments?: EmailAttachment[];
};

export type SendEmailResult =
  | { status: "sent" }
  | { status: "failed"; error: string }
  | { status: "not_configured" };

/** Escapes text interpolated into a hand-built HTML email body — customer names, invoice notes, etc. are free text, not markup. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fromHeader(fromName?: string): string {
  const email = process.env.EMAIL_FROM ?? "";
  const name = (fromName || process.env.EMAIL_FROM_NAME || "Eduvia").replace(/[<>"\r\n]/g, "");
  return email ? `${name} <${email}>` : name;
}

async function sendViaResend(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.EMAIL_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) return { status: "not_configured" };

  // Unlike the Gmail/Hostinger SMTP paths below, this used to have no
  // try/catch — a network-level failure reaching Resend (DNS, timeout,
  // connection refused) throws a raw `fetch failed` out of `fetch()`
  // itself, before there's ever an HTTP response to check `.ok` on. That
  // crashed straight through whatever called sendEmail (e.g. a form
  // submission's own "new lead" notification), instead of just failing to
  // send the one email like every other provider path already does.
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromHeader(input.fromName),
        to: input.to,
        subject: input.subject,
        html: input.html,
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
        attachments: input.attachments?.map((a) => ({
          filename: a.filename,
          content: a.content.toString("base64"),
        })),
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return { status: "failed", error: `Resend API error ${response.status}: ${body}` };
    }
    return { status: "sent" };
  } catch (error) {
    return { status: "failed", error: error instanceof Error ? error.message : String(error) };
  }
}

// Reused across calls instead of opening a brand-new SMTP connection (full
// TCP + TLS + AUTH handshake) per email — that round-trip was the actual
// cost behind "submitting any form takes a long time": every public form's
// submit action used to await one or more of these sends before the
// visitor ever saw a response. `pool: true` keeps a small set of
// connections warm so a burst of sends (e.g. notifying several admins at
// once) reuses them instead of opening one each. Lazily created on first
// use per server process, not at module load, since EMAIL_API_KEY may not
// be set in every environment (e.g. local dev with EMAIL_PROVIDER unset).
let gmailTransporter: nodemailer.Transporter | null = null;

function getGmailTransporter(user: string, pass: string): nodemailer.Transporter {
  gmailTransporter ??= nodemailer.createTransport({
    service: "gmail",
    pool: true,
    auth: { user, pass },
  });
  return gmailTransporter;
}

async function sendViaGmail(input: SendEmailInput): Promise<SendEmailResult> {
  const user = process.env.EMAIL_FROM;
  const pass = process.env.EMAIL_API_KEY;
  if (!user || !pass) return { status: "not_configured" };

  const transporter = getGmailTransporter(user, pass);

  try {
    await transporter.sendMail({
      from: fromHeader(input.fromName),
      to: input.to,
      subject: input.subject,
      html: input.html,
      replyTo: input.replyTo,
      attachments: input.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      })),
    });
    return { status: "sent" };
  } catch (error) {
    return { status: "failed", error: error instanceof Error ? error.message : String(error) };
  }
}

// Same reasoning as gmailTransporter above — reused, not recreated per send.
let hostingerTransporter: nodemailer.Transporter | null = null;

function getHostingerTransporter(user: string, pass: string): nodemailer.Transporter {
  hostingerTransporter ??= nodemailer.createTransport({
    host: "smtp.hostinger.com",
    port: 465,
    secure: true,
    pool: true,
    auth: { user, pass },
  });
  return hostingerTransporter;
}

/** A real mailbox on the app's own domain (e.g. Hostinger Business Email) rather than a personal Gmail — same auth shape as sendViaGmail, just a different SMTP endpoint. */
async function sendViaHostinger(input: SendEmailInput): Promise<SendEmailResult> {
  const user = process.env.EMAIL_FROM;
  const pass = process.env.EMAIL_API_KEY;
  if (!user || !pass) return { status: "not_configured" };

  const transporter = getHostingerTransporter(user, pass);

  try {
    await transporter.sendMail({
      from: fromHeader(input.fromName),
      to: input.to,
      subject: input.subject,
      html: input.html,
      replyTo: input.replyTo,
      attachments: input.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      })),
    });
    return { status: "sent" };
  } catch (error) {
    return { status: "failed", error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * A Hostinger Business Email mailbox through Hostinger's Mail API, with an
 * API token scoped to that one mailbox: no mailbox password needed, so the
 * password other apps use for SMTP never has to change. The API has no
 * Reply-To, so a reply goes to the mailbox itself; callers that need the
 * visitor's address show it in the email body.
 */
async function sendViaHostingerApi(input: SendEmailInput): Promise<SendEmailResult> {
  const token = process.env.HOSTINGER_MAIL_TOKEN;
  const mailboxId = process.env.HOSTINGER_MAILBOX_ID;
  if (!token || !mailboxId) return { status: "not_configured" };

  try {
    const response = await fetch(
      `https://api.mail.hostinger.com/api/v1/mailboxes/${encodeURIComponent(mailboxId)}/send`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          to: [input.to],
          subject: input.subject,
          html: input.html,
          displayName: (input.fromName || process.env.EMAIL_FROM_NAME || "Eduvia").replace(/[<>"\r\n]/g, ""),
          attachments: input.attachments?.map((a) => ({
            filename: a.filename,
            content: a.content.toString("base64"),
            contentType: a.contentType,
          })),
        }),
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return { status: "failed", error: `Hostinger Mail API error ${response.status}: ${body.slice(0, 500)}` };
    }
    return { status: "sent" };
  } catch (error) {
    return { status: "failed", error: error instanceof Error ? error.message : String(error) };
  }
}

/** Whether a provider is configured, and what the account page says about it. */
export function emailSetup(): { ok: boolean; text: string } {
  const provider = process.env.EMAIL_PROVIDER;
  if (provider === "hostinger_api") {
    if (process.env.HOSTINGER_MAIL_TOKEN && process.env.HOSTINGER_MAILBOX_ID) {
      return { ok: true, text: `Emails go out through your Hostinger mailbox${process.env.EMAIL_FROM ? ` ${process.env.EMAIL_FROM}` : ""}.` };
    }
    return { ok: false, text: "Set HOSTINGER_MAIL_TOKEN and HOSTINGER_MAILBOX_ID in hPanel (Node.js app → Environment variables)." };
  }
  if (provider && process.env.EMAIL_FROM && process.env.EMAIL_API_KEY) {
    return { ok: true, text: `Emails go out through ${provider} as ${process.env.EMAIL_FROM}.` };
  }
  return {
    ok: false,
    text: "Email sending isn't set up. Submissions are still saved, but notifications, automation emails and password resets won't go out. Set EMAIL_PROVIDER in hPanel (Node.js app → Environment variables).",
  };
}

/**
 * Sends an email through whichever provider is configured
 * (`EMAIL_PROVIDER=hostinger_api|resend|gmail|hostinger`). With no provider configured,
 * this no-ops and returns `{ status: "not_configured" }` — callers should
 * still let the user proceed (e.g. mark an invoice as sent) and surface
 * that the PDF needs to be shared manually.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  switch (process.env.EMAIL_PROVIDER) {
    case "resend":
      return sendViaResend(input);
    case "gmail":
      return sendViaGmail(input);
    case "hostinger":
      return sendViaHostinger(input);
    case "hostinger_api":
      return sendViaHostingerApi(input);
    default:
      return { status: "not_configured" };
  }
}
