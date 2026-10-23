"use client";

import { useId, useState } from "react";
import { createLinkAction, renameLinkAction } from "@/lib/actions/links";
import { buildTrackingLink, LINK_SOURCES } from "@/lib/forms/utm";
import { CreateDialog } from "@/components/create-dialog";

/** Kept in step with OTHER_SOURCE in lib/actions/links.ts. */
const OTHER = "__other";

/** The New link dialog's choices, with the finished link shown as they're made. */
function LinkFields({ page: initialPage }: { page: string }) {
  const id = useId();
  const [page, setPage] = useState(initialPage);
  const [source, setSource] = useState<string>(LINK_SOURCES[0].value);
  const [otherSource, setOtherSource] = useState("");
  const [paid, setPaid] = useState(false);
  const [campaign, setCampaign] = useState("");
  const [content, setContent] = useState("");
  const link = buildTrackingLink({ page, source: source === OTHER ? otherSource : source, paid, campaign, content });

  return (
    <>
      <div className="field">
        <label htmlFor={`${id}-source`}>Where you&apos;ll post it</label>
        <select id={`${id}-source`} name="source" value={source} onChange={(event) => setSource(event.target.value)}>
          {LINK_SOURCES.map((entry) => (
            <option key={entry.value} value={entry.value}>{entry.label}</option>
          ))}
          <option value={OTHER}>Somewhere else…</option>
        </select>
        {source === OTHER && (
          <input aria-label="Name of the place" name="otherSource" value={otherSource} onChange={(event) => setOtherSource(event.target.value)} />
        )}
        {source === OTHER && <span className="hint">Its name, e.g. a partner school or a directory site.</span>}
      </div>
      <label className="check">
        <input type="checkbox" name="paid" checked={paid} onChange={(event) => setPaid(event.target.checked)} />
        <span>It&apos;s a paid ad</span>
      </label>
      <div className="field">
        <label htmlFor={`${id}-campaign`}>Campaign name</label>
        <input id={`${id}-campaign`} name="campaign" value={campaign} onChange={(event) => setCampaign(event.target.value)} />
        <span className="hint">What you&apos;re promoting, e.g. Holiday camp 2026. Optional.</span>
      </div>
      <div className="field">
        <label htmlFor={`${id}-content`}>Which ad or post (optional)</label>
        <input id={`${id}-content`} name="content" value={content} onChange={(event) => setContent(event.target.value)} />
        <span className="hint">Only to tell two links in one campaign apart, e.g. Video 1.</span>
      </div>
      <div className="field">
        <label htmlFor={`${id}-page`}>Page people land on</label>
        <input id={`${id}-page`} name="page" type="url" value={page} onChange={(event) => setPage(event.target.value)} />
        <span className="hint">Your form&apos;s page. Usually leave as it is.</span>
      </div>
      <div className="stack-sm">
        <span className="field-label">Your link</span>
        {link ? (
          <div className="endpoint wraps">
            <code>{link}</code>
          </div>
        ) : (
          <p className="notice warn">{source === OTHER && !otherSource.trim() ? "Type where you'll post it." : "The page needs to be a full web address, starting with https://"}</p>
        )}
      </div>
    </>
  );
}

export function NewLinkButton({ page }: { page: string }) {
  return (
    <CreateDialog
      buttonLabel="New link"
      title="New tracking link"
      nameLabel="Name it so you'll recognise it"
      submitLabel="Save link"
      pendingLabel="Saving…"
      closeOnSuccess
      action={createLinkAction}
    >
      <span className="hint" style={{ marginTop: -10 }}>For example: Flyer – school fair, or WhatsApp – October promo.</span>
      <LinkFields page={page} />
    </CreateDialog>
  );
}

export function RenameLinkButton({ link }: { link: { id: string; name: string } }) {
  return (
    <CreateDialog
      buttonLabel="Rename"
      buttonIcon={null}
      buttonClassName="btn ghost sm"
      title="Rename link"
      nameLabel="Link name"
      submitLabel="Save name"
      pendingLabel="Saving…"
      initialName={link.name}
      closeOnSuccess
      action={renameLinkAction.bind(null, link.id)}
    >
      <p className="muted">Only the name changes. The link itself stays the same, so wherever you&apos;ve posted it keeps counting.</p>
    </CreateDialog>
  );
}
