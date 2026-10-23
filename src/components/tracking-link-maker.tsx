"use client";

import { useId, useState } from "react";
import { buildTrackingLink, LINK_SOURCES } from "@/lib/forms/utm";
import { CopyButton } from "@/components/copy-button";

const OTHER = "__other";

/**
 * Makes a link with UTM tags from a few plain choices, so nobody has to type
 * ?utm_source=…&utm_campaign=… by hand. The tags arrive with each enquiry
 * through /utm.js.
 */
export function TrackingLinkMaker({ page: initialPage }: { page: string }) {
  const id = useId();
  const [page, setPage] = useState(initialPage);
  const [source, setSource] = useState<string>(LINK_SOURCES[0].value);
  const [otherSource, setOtherSource] = useState("");
  const [paid, setPaid] = useState(false);
  const [campaign, setCampaign] = useState("");
  const [content, setContent] = useState("");

  const sourceValue = source === OTHER ? otherSource : source;
  const link = buildTrackingLink({ page, source: sourceValue, paid, campaign, content });
  const metaAd = paid && (source === "facebook" || source === "instagram");
  const metaParameters = `utm_source=${source}&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{ad.name}}`;

  return (
    <div className="stack">
      <div className="form-grid">
        <div className="field full">
          <label htmlFor={`${id}-page`}>Page people should land on</label>
          <input id={`${id}-page`} type="url" value={page} onChange={(event) => setPage(event.target.value)} />
          <span className="hint">The page with your form, or any page that has the script above.</span>
        </div>
        <div className="field">
          <label htmlFor={`${id}-source`}>Where you&apos;ll post it</label>
          <select id={`${id}-source`} value={source} onChange={(event) => setSource(event.target.value)}>
            {LINK_SOURCES.map((entry) => (
              <option key={entry.value} value={entry.value}>{entry.label}</option>
            ))}
            <option value={OTHER}>Somewhere else…</option>
          </select>
          {source === OTHER && (
            <input aria-label="Name of the place" value={otherSource} onChange={(event) => setOtherSource(event.target.value)} />
          )}
          {source === OTHER && <span className="hint">Its name, e.g. a partner school or a directory site.</span>}
        </div>
        <div className="field">
          <label htmlFor={`${id}-campaign`}>Campaign name</label>
          <input id={`${id}-campaign`} value={campaign} onChange={(event) => setCampaign(event.target.value)} />
          <span className="hint">What you&apos;re promoting, e.g. Holiday camp 2026.</span>
        </div>
        <div className="field">
          <label htmlFor={`${id}-content`}>Which ad or post (optional)</label>
          <input id={`${id}-content`} value={content} onChange={(event) => setContent(event.target.value)} />
          <span className="hint">To tell two ads in one campaign apart, e.g. Video 1.</span>
        </div>
        <label className="check" style={{ alignSelf: "end", paddingBottom: 10 }}>
          <input type="checkbox" checked={paid} onChange={(event) => setPaid(event.target.checked)} />
          <span>It&apos;s a paid ad</span>
        </label>
      </div>

      {link ? (
        <div className="stack-sm">
          <span className="field-label">Your link</span>
          <div className="endpoint wraps">
            <code>{link}</code>
            <CopyButton text={link} label="Copy link" />
          </div>
        </div>
      ) : (
        <p className="notice warn">
          {sourceValue.trim() ? "The page needs to be a full web address, starting with https://" : "Type where you'll post it."}
        </p>
      )}

      {metaAd && (
        <div className="stack-sm">
          <p className="muted">
            Running it in Meta Ads Manager? Paste this into each ad&apos;s <strong>URL parameters</strong> box instead. Meta fills
            in the campaign and ad names for you, so every ad is labelled without making a link for each.
          </p>
          <div className="endpoint wraps">
            <code>{metaParameters}</code>
            <CopyButton text={metaParameters} label="Copy" />
          </div>
        </div>
      )}
    </div>
  );
}
