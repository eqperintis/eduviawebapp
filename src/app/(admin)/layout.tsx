import { connection } from "next/server";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { ensureDatabase } from "@/lib/migrate";
import { logoutAction } from "@/lib/actions/auth";
import { Nav } from "@/components/nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Request-time only: never prerendered at build, where there is no database.
  await connection();
  await ensureDatabase();
  await requireUser();
  return (
    <>
      <header className="top">
        <div className="wrap">
          <Link className="brand" href="/forms" aria-label="Quolume Marketing home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/quolume-logo-horizontal.webp" alt="Quolume" width={150} height={34} />
            <small>Marketing</small>
          </Link>
          <Nav />
          <form action={logoutAction}>
            <button className="btn ghost sm" type="submit">Sign out</button>
          </form>
        </div>
      </header>
      <main className="page wrap">{children}</main>
    </>
  );
}
