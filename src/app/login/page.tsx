import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import { ensureDatabase } from "@/lib/migrate";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reset?: string }> }) {
  // Request-time only: never prerendered at build, where there is no database.
  await connection();
  await ensureDatabase();
  if (await getAuthenticatedUser()) redirect("/forms");
  const { reset } = await searchParams;
  return (
    <AuthShell title="Sign in" intro="Forms and automations for eduvia.my.">
      {reset === "1" && (
        <p className="notice ok" role="status">
          Password changed. Sign in with the new one.
        </p>
      )}
      <LoginForm />
    </AuthShell>
  );
}
