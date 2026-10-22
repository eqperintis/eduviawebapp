import { requireUser } from "@/lib/auth";
import { appUrl } from "@/lib/brand";
import { getGoogleConnectionStatus, missingGoogleSettings } from "@/lib/google/oauth";
import { disconnectGoogleAction } from "@/lib/actions/google";
import { ConfirmButton } from "@/components/confirm-button";
import { PasswordForm } from "./password-form";
import { emailSetup } from "@/lib/email/send";

export const metadata = { title: "Account" };

const GOOGLE_ERRORS: Record<string, string> = {
  denied: "Google access wasn't allowed, so nothing was connected.",
  failed: "Google didn't accept that. Try connecting again.",
  config: "Google isn't set up on the server yet (see below).",
};

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ googleConnected?: string; googleError?: string }>;
}) {
  const user = await requireUser();
  const query = await searchParams;
  const email = emailSetup();
  const cron = !!process.env.CRON_SECRET;
  const google = await getGoogleConnectionStatus();
  const missing = missingGoogleSettings();
  return (
    <div className="stack">
      <div className="page-head">
        <p className="label">Account</p>
        <h1>{user.email}</h1>
      </div>
      {query.googleConnected && <p className="notice ok">Google connected. Add a Google Sheets step to an automation.</p>}
      {query.googleError && <p className="notice bad">{GOOGLE_ERRORS[query.googleError] ?? "Couldn't connect Google."}</p>}
      <div className="grid-2">
        <div className="card stack">
          <div className="stack-sm">
            <h2>Google Sheets</h2>
            <p className="muted">
              Connect a Google account so automations can add each submission as a row in a sheet you pick from Google
              Drive. The app can only open the files you pick, never the rest of your Drive.
            </p>
          </div>
          {google.connected ? (
            <div className="spread">
              <p>
                Connected as <strong>{google.email ?? "a Google account"}</strong>
              </p>
              <ConfirmButton
                action={disconnectGoogleAction}
                label="Disconnect"
                confirm="Disconnect Google? Google Sheets steps stop adding rows until you connect again."
              />
            </div>
          ) : missing.length === 0 ? (
            <div className="row">
              {/* A plain link: the route redirects to Google. */}
              <a className="btn" href="/api/google/connect">Connect Google</a>
            </div>
          ) : (
            <div className="notice warn stack-sm">
              <p>
                Google isn&apos;t set up on the server yet. In hPanel → marketing.quolume.com → Node.js → Environment
                variables, add: <code>{missing.join(", ")}</code>.
              </p>
              <p>
                In Google Cloud, the OAuth client needs this redirect URI:{" "}
                <code>{`${appUrl()}/api/google/callback`}</code>
              </p>
            </div>
          )}
        </div>
        <PasswordForm />
        <div className="card stack">
          <h2>Set-up checks</h2>
          <p className={`notice ${email.ok ? "ok" : "warn"}`}>{email.text}</p>
          <p className={`notice ${cron ? "ok" : "warn"}`}>
            {cron
              ? "Wait steps are advanced by the cron job hitting /api/cron/automations."
              : "CRON_SECRET isn't set, so Wait steps never resume. Set it and add the cron job."}
          </p>
        </div>
      </div>
    </div>
  );
}
