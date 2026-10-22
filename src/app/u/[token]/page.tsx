import { connection } from "next/server";
import { db } from "@/lib/db";
import { ensureDatabase } from "@/lib/migrate";
import { unsubscribeAction } from "@/lib/actions/unsubscribe";
import { SITE_URL } from "@/lib/brand";

/**
 * The unsubscribe link in automation emails. It asks for a click rather than
 * acting on the visit, since email scanners open every link they see.
 */

export const metadata = { title: "Unsubscribe", robots: { index: false } };

export default async function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // Request-time only: never prerendered at build, where there is no database.
  await connection();
  await ensureDatabase();
  const submission = await db.formSubmission.findUnique({ where: { emailOptOutToken: token } });

  return (
    <div className="center">
      <div className="auth">
        <a href={SITE_URL} aria-label="Quolume home" className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/quolume-logo-horizontal.webp" alt="Quolume" width={176} height={40} />
        </a>
        <div className="card stack">
          {!submission ? (
            <>
              <h1>Link not found.</h1>
              <p className="muted">This unsubscribe link doesn&apos;t work any more.</p>
            </>
          ) : submission.emailOptOutAt ? (
            <>
              <h1>You&apos;re unsubscribed.</h1>
              <p className="muted">{submission.email} won&apos;t get any more follow-up emails from Quolume.</p>
            </>
          ) : (
            <form action={unsubscribeAction.bind(null, token)} className="stack">
              <h1>Unsubscribe?</h1>
              <p className="muted">Stop follow-up emails from Quolume to {submission.email}.</p>
              <button className="btn" type="submit">Unsubscribe</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
