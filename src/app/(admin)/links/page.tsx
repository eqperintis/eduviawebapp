import { db } from "@/lib/db";
import { appUrl, SITE_URL } from "@/lib/brand";
import { formatKL } from "@/lib/tz";
import { linkUrl, sourceLabel } from "@/lib/forms/utm";
import { deleteLinkAction } from "@/lib/actions/links";
import { ConfirmButton } from "@/components/confirm-button";
import { CopyButton } from "@/components/copy-button";
import { NewLinkButton, RenameLinkButton } from "@/components/link-buttons";

export const metadata = { title: "Links" };

const DAYS = 30;

const MEDIUM_LABEL: Record<string, string> = {
  paid: "Paid ad",
  social: "Post",
  messaging: "Message",
  search: "Search",
  email: "Email",
  print: "Printed",
  referral: "Link",
};

function tagKey(tags: { source: string; medium: string; campaign: string; content: string }): string {
  return [tags.source, tags.medium, tags.campaign, tags.content].join("\u0000");
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export default async function LinksPage() {
  const since = daysAgo(DAYS);
  const [links, tagged, cameFrom, recentTotal, formPage] = await Promise.all([
    db.trackingLink.findMany({ orderBy: { createdAt: "desc" } }),
    db.formSubmission.groupBy({
      by: ["utmSource", "utmMedium", "utmCampaign", "utmContent"],
      where: { utmSource: { not: "" } },
      _count: { _all: true },
      _max: { createdAt: true },
    }),
    db.formSubmission.groupBy({
      by: ["cameFrom"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    }),
    db.formSubmission.count({ where: { createdAt: { gte: since } } }),
    db.form.findFirst({ where: { pageUrl: { not: null } }, orderBy: { updatedAt: "desc" }, select: { pageUrl: true } }),
  ]);

  const counts = new Map(
    tagged.map((group) => [
      tagKey({ source: group.utmSource, medium: group.utmMedium, campaign: group.utmCampaign, content: group.utmContent }),
      { count: group._count._all, last: group._max.createdAt },
    ]),
  );
  const savedKeys = new Set(links.map(tagKey));
  const unsaved = tagged
    .filter((group) => !savedKeys.has(tagKey({ source: group.utmSource, medium: group.utmMedium, campaign: group.utmCampaign, content: group.utmContent })))
    .sort((a, b) => b._count._all - a._count._all);

  // Who came through each saved link: the latest few, with the form they filled in.
  const signUps = await Promise.all(
    links.map((link) =>
      db.formSubmission.findMany({
        where: { utmSource: link.source, utmMedium: link.medium, utmCampaign: link.campaign, utmContent: link.content },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, name: true, email: true, createdAt: true, form: { select: { id: true, name: true } } },
      }),
    ),
  );

  const found = cameFrom.filter((group) => group.cameFrom).sort((a, b) => b._count._all - a._count._all);
  const notRecorded = cameFrom.find((group) => !group.cameFrom)?._count._all ?? 0;
  const top = Math.max(1, ...found.map((group) => group._count._all));
  const script = `<script src="${appUrl()}/utm.js" defer></script>`;
  const defaultPage = formPage?.pageUrl || `${SITE_URL}/`;
  const metaParameters = "utm_source=facebook&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{ad.name}}";

  return (
    <div className="stack">
      <div className="page-head">
        <p className="label">Links</p>
        <div className="spread">
          <h1>Where your sign-ups come from</h1>
          <NewLinkButton page={defaultPage} />
        </div>
        <p className="muted">
          Make one link for each place you share your website (a flyer, WhatsApp, your Instagram bio, an ad). Share that
          link instead of your plain address, and each sign-up is counted under the link it came through.
        </p>
      </div>

      <div className="card stack">
        <div className="spread">
          <p className="label">How people found you · last {DAYS} days</p>
          <span className="muted">{recentTotal} sign-up{recentTotal === 1 ? "" : "s"}</span>
        </div>
        {found.length > 0 ? (
          <ul className="shares">
            {found.map((group) => (
              <li key={group.cameFrom}>
                <span>{group.cameFrom}</span>
                <span className="share-bar" aria-hidden="true">
                  <i style={{ width: `${(group._count._all / top) * 100}%` }} />
                </span>
                <strong>{group._count._all}</strong>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Nothing yet. This fills in by itself once your website&apos;s form page has the line below.</p>
        )}
        {notRecorded > 0 && (
          <p className="hint">
            {notRecorded} sign-up{notRecorded === 1 ? "" : "s"} without this: sent before the line below was on the page, or
            from a page without it.
          </p>
        )}
        <details>
          <summary className="small-link">The line your website needs</summary>
          <div className="stack-sm" style={{ marginTop: 10 }}>
            <p className="muted">
              Put this once on the page with your form, or ask whoever builds your website to. Without it, nothing on this
              page can be counted.
            </p>
            <div className="endpoint">
              <code>{script}</code>
              <CopyButton text={script} label="Copy" />
            </div>
          </div>
        </details>
      </div>

      {links.length === 0 ? (
        <div className="card empty">
          <p>No links yet. Make your first one, e.g. for the flyer or your WhatsApp broadcast.</p>
          <NewLinkButton page={defaultPage} />
        </div>
      ) : (
        <div className="links">
          {links.map((link, index) => {
            const url = linkUrl(link.pageUrl, link) ?? link.pageUrl;
            const stats = counts.get(tagKey(link));
            const count = stats?.count ?? 0;
            return (
              <article key={link.id} className="card stack-sm link-card">
                <div className="spread">
                  <h3>{link.name}</h3>
                  <span className={`pill ${count > 0 ? "ok" : ""}`}>
                    {count} sign-up{count === 1 ? "" : "s"}
                  </span>
                </div>
                <p className="muted">
                  {sourceLabel(link.source)} · {MEDIUM_LABEL[link.medium] ?? link.medium}
                  {link.campaign && <> · {link.campaign}</>}
                  {link.content && <> · {link.content}</>}
                  {stats?.last && <> · last sign-up {formatKL(stats.last)}</>}
                </p>
                <div className="endpoint wraps">
                  <code>{url}</code>
                  <CopyButton text={url} label="Copy link" />
                </div>
                {count > 0 && (
                  <details>
                    <summary className="small-link">Who signed up</summary>
                    <ul className="recent">
                      {signUps[index].map((submission) => (
                        <li key={submission.id}>
                          <span>
                            <strong>{submission.name || "Someone"}</strong>
                            {submission.email && <span className="muted"> · {submission.email}</span>}
                            <span className="muted"> · {submission.form.name}</span>
                          </span>
                          <span className="faint mono">{formatKL(submission.createdAt)}</span>
                        </li>
                      ))}
                    </ul>
                    {count > signUps[index].length && <p className="hint">Showing the latest {signUps[index].length}.</p>}
                  </details>
                )}
                <div className="row">
                  <RenameLinkButton link={link} />
                  <ConfirmButton
                    action={deleteLinkAction.bind(null, link.id)}
                    label="Delete"
                    confirm={`Delete “${link.name}”? Wherever you've posted it keeps working and sign-ups keep their labels; it just stops being listed and counted here.`}
                  />
                </div>
              </article>
            );
          })}
        </div>
      )}

      {unsaved.length > 0 && (
        <div className="card stack">
          <div className="stack-sm">
            <p className="label">Other labelled sign-ups</p>
            <p className="muted">
              Sign-ups with labels that don&apos;t match a saved link, e.g. from Facebook ads labelled in Ads Manager, or a
              link you deleted.
            </p>
          </div>
          <ul className="recent">
            {unsaved.map((group) => (
              <li key={tagKey({ source: group.utmSource, medium: group.utmMedium, campaign: group.utmCampaign, content: group.utmContent })}>
                <span>
                  <strong>{sourceLabel(group.utmSource)}</strong>
                  <span className="muted">
                    {" "}· {MEDIUM_LABEL[group.utmMedium] ?? (group.utmMedium || "—")}
                    {group.utmCampaign && <> · {group.utmCampaign}</>}
                    {group.utmContent && <> · {group.utmContent}</>}
                  </span>
                </span>
                <strong>{group._count._all}</strong>
              </li>
            ))}
          </ul>
        </div>
      )}

      <details className="card">
        <summary className="spread">
          <span className="label">Running Facebook or Instagram ads?</span>
          <span className="small-link">Show</span>
        </summary>
        <div className="stack-sm" style={{ marginTop: 14 }}>
          <p className="muted">
            Instead of making a link per ad, paste this once into each ad&apos;s <strong>URL parameters</strong> box in Meta
            Ads Manager (in the ad&apos;s <strong>Tracking</strong> section). Meta fills in the campaign and ad names,
            and the sign-ups show above under &ldquo;Other labelled sign-ups&rdquo;.
          </p>
          <div className="endpoint wraps">
            <code>{metaParameters}</code>
            <CopyButton text={metaParameters} label="Copy" />
          </div>
        </div>
      </details>
    </div>
  );
}
