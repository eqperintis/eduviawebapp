"use server";

import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "crypto";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { ensureDatabase } from "@/lib/migrate";
import { appUrl } from "@/lib/brand";
import { sendEmail } from "@/lib/email/send";
import { brandEmailHtml, buttonHtml } from "@/lib/email/render";
import { isEmail } from "@/lib/forms/fields";
import { checkPublicFormRateLimit, clearLoginFailures } from "@/lib/rate-limit";
import type { FormState } from "@/lib/actions/auth";

const TOKEN_TTL_MS = 60 * 60 * 1000;
// A fresh link only goes out if the last one is older than this, so the form can't be used to flood an inbox.
const RESEND_COOLDOWN_MS = 2 * 60 * 1000;
const MIN_PASSWORD = 10;

const SENT = "If that email has an account, a reset link is on its way. It works for one hour.";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Public. Answers the same way whether or not the email has an account, so
 * it can't be used to find out who does.
 */
export async function requestPasswordResetAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const limit = await checkPublicFormRateLimit("forgot-password");
  if (!limit.ok) return { error: "Too many tries. Wait a few minutes and try again." };

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!isEmail(email)) return { error: "Enter the email you sign in with." };

  await ensureDatabase();
  const user = await db.user.findUnique({ where: { email } });
  if (!user) return { ok: SENT };

  const last = await db.passwordResetToken.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
  if (last && Date.now() - last.createdAt.getTime() < RESEND_COOLDOWN_MS) return { ok: SENT };

  const token = randomBytes(32).toString("base64url");
  await db.passwordResetToken.create({
    data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + TOKEN_TTL_MS) },
  });
  // Old, spent links have no use: tidy them up as we go.
  await db.passwordResetToken.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - TOKEN_TTL_MS) } } });

  const link = `${appUrl()}/reset-password/${token}`;
  const html = brandEmailHtml({
    bodyHtml:
      `<p>Someone asked to reset the password for ${user.email} on Eduvia Marketing.</p>` +
      buttonHtml(link, "Choose a new password") +
      `<p>The link works once, for one hour. If it wasn't you, ignore this email: your password stays as it is.</p>`,
    footer: "Sent because a password reset was requested for this address.",
  });
  // Not awaited: a slow send would otherwise make "has an account" measurably slower than "doesn't".
  sendEmail({ to: user.email, subject: "Reset your Eduvia Marketing password", html })
    .then((result) => {
      if (result.status !== "sent") console.error("[password-reset] email not sent", result);
    })
    .catch((error) => console.error("[password-reset] email failed", error));

  return { ok: SENT };
}

async function findUsableToken(token: string) {
  const row = await db.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!row || row.usedAt || row.expiresAt < new Date()) return null;
  return row;
}

/** Whether a reset link can still be used, for the page to show the form or say it has expired. */
export async function isResetTokenUsable(token: string): Promise<boolean> {
  await ensureDatabase();
  return !!(await findUsableToken(token));
}

/** Public, gated by the one-hour token from the email. */
export async function resetPasswordAction(token: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < MIN_PASSWORD) return { error: `Use at least ${MIN_PASSWORD} characters.` };
  if (password !== confirm) return { error: "The two passwords don't match." };

  const row = await findUsableToken(token);
  if (!row) return { error: "This link has expired or was already used. Ask for a new one." };

  const passwordHash = await bcrypt.hash(password, 12);
  const used = await db.$transaction(async (tx) => {
    // Claim the token first, so two tabs can't both use it.
    const claimed = await tx.passwordResetToken.updateMany({
      where: { id: row.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count === 0) return null;
    const user = await tx.user.update({ where: { id: row.userId }, data: { passwordHash } });
    // Every other link for this account dies with the old password.
    await tx.passwordResetToken.deleteMany({ where: { userId: row.userId, id: { not: row.id } } });
    return user;
  });
  if (!used) return { error: "This link has expired or was already used. Ask for a new one." };
  await clearLoginFailures(used.email);

  // Sessions carry the old password's fingerprint, so every device is now signed out.
  redirect("/login?reset=1");
}
