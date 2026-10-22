import { connection } from "next/server";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { ensureDatabase } from "@/lib/migrate";
import { logoutAction } from "@/lib/actions/auth";
import { Nav } from "@/components/nav";
import { BRAND, LOGO } from "@/lib/brand";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Request-time only: never prerendered at build, where there is no database.
  await connection();
  await ensureDatabase();
  await requireUser();
  return (
    <>
      <header className="top">
        <div className="wrap">
          <Link className="brand" href="/forms" aria-label="Eduvia Marketing home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO.web} alt={BRAND.name} width={LOGO.webWidth} height={LOGO.webHeight} />
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
