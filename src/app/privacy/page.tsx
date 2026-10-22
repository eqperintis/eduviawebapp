import { SITE_URL } from "@/lib/brand";

/**
 * The privacy policy Google asks for before the Google Sheets connection can
 * be published (Google Auth Platform → Branding). Public, no sign-in.
 */

export const metadata = { title: "Privacy policy", robots: { index: true } };

export default function PrivacyPage() {
  return (
    <div className="center" style={{ alignItems: "start" }}>
      <div className="stack" style={{ width: "min(720px, 100%)", paddingBlock: 32 }}>
        <a href={SITE_URL} aria-label="Quolume home" className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/quolume-logo-horizontal.webp" alt="Quolume" width={176} height={40} />
        </a>
        <article className="card stack legal">
          <p className="label">Privacy policy · Updated 7 October 2026</p>
          <h1>How Quolume handles your information</h1>
          <p>
            This covers the forms on quolume.com and marketing.quolume.com, the tool Quolume uses to receive and follow
            up on them. Quolume is run by Alif.
          </p>

          <h2>What we collect</h2>
          <p>
            Only what you type into a Quolume form, for example your name, email, phone number and details about your
            business, plus the page you sent it from and the time.
          </p>

          <h2>How we use it</h2>
          <p>
            To reply to you, to send the follow-up emails you&apos;d expect after filling in the form, and to keep a record
            of applications. We don&apos;t sell your information or share it with advertisers. Every follow-up email has
            an unsubscribe link.
          </p>

          <h2>Where it&apos;s kept</h2>
          <p>
            In Quolume&apos;s own database on Hostinger, and in Google Sheets that Quolume owns when a form is set up to
            add rows there.
          </p>

          <h2>Google account access</h2>
          <p>
            The marketing.quolume.com admin can connect a Google account to add form submissions as rows in Google
            Sheets. It asks for access to Google Sheets and to only the Drive files picked in Google&apos;s file picker
            (the <code>drive.file</code> scope), never the rest of the Drive, plus the account&apos;s email address to show
            which account is connected. That access is used only to write those rows. It isn&apos;t used for advertising,
            isn&apos;t shared with anyone else, and isn&apos;t used to train AI models. Quolume&apos;s use of information
            received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use
            requirements. The connection can be removed at any time from the Account page or from your Google Account
            settings.
          </p>

          <h2>Keeping and deleting</h2>
          <p>
            Submissions are kept for as long as they&apos;re useful for working with you. To see, correct or delete what
            you sent, contact Quolume through{" "}
            <a href={SITE_URL}>quolume.com</a> and it will be done.
          </p>
        </article>
      </div>
    </div>
  );
}
