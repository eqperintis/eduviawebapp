import Link from "next/link";
import { connection } from "next/server";
import { isResetTokenUsable } from "@/lib/actions/password-reset";
import { AuthShell } from "@/components/auth-shell";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;
  if (!(await isResetTokenUsable(token))) {
    return (
      <AuthShell title="This link has expired" intro="Reset links work once, for one hour.">
        <Link href="/forgot-password" className="btn">Send a new link</Link>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Choose a new password" intro="At least 10 characters. Every device gets signed out.">
      <ResetPasswordForm token={token} />
    </AuthShell>
  );
}
