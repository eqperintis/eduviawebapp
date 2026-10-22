import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import { ensureDatabase } from "@/lib/migrate";
import { AuthShell } from "@/components/auth-shell";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata = { title: "Forgot password" };

export default async function ForgotPasswordPage() {
  await connection();
  await ensureDatabase();
  if (await getAuthenticatedUser()) redirect("/account");
  return (
    <AuthShell title="Forgot your password?" intro="Enter the email you sign in with. I'll send a link to choose a new one.">
      <ForgotPasswordForm />
    </AuthShell>
  );
}
