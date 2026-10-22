"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { ensureDatabase } from "@/lib/migrate";
import { createSession, destroySession, requireUser } from "@/lib/auth";
import { clearLoginFailures, loginWaitMinutes, recordLoginFailure } from "@/lib/rate-limit";

export type FormState = { error?: string; ok?: string } | undefined;

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };

  await ensureDatabase();
  const wait = await loginWaitMinutes(email);
  if (wait > 0) return { error: `Too many tries. Wait ${wait} minute${wait === 1 ? "" : "s"} and try again.` };

  const user = await db.user.findUnique({ where: { email } });
  const valid = user ? await bcrypt.compare(password, user.passwordHash) : false;
  if (!user || !valid) {
    await recordLoginFailure(email);
    return { error: "That email and password don't match." };
  }

  await clearLoginFailures(email);
  await createSession({ userId: user.id, email: user.email });
  redirect("/forms");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}

export async function changePasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  if (!(await bcrypt.compare(current, user.passwordHash))) return { error: "Your current password is wrong." };
  if (next.length < 10) return { error: "Use at least 10 characters." };
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(next, 12) } });
  // The old session carried the old password's fingerprint: issue a fresh one.
  await createSession({ userId: user.id, email: user.email });
  return { ok: "Password changed. Other devices are signed out." };
}
