"use client";

import { useFormAction } from "@/components/use-form-action";
import type { FormState } from "@/lib/actions/auth";
import { deleteFormAction } from "@/lib/actions/forms";
import { ConfirmButton } from "@/components/confirm-button";
import { FormMessage } from "@/components/form-message";

type Settings = {
  name: string;
  status: string;
  notifyEnabled: boolean;
  notifyEmails: string;
  allowedDomains: string;
  redirectUrl: string;
  pageUrl: string;
  pageReadAt: string;
  successTitle: string;
  successMessage: string;
};

export function SettingsForm({
  formId,
  initial,
  action,
}: {
  formId: string;
  initial: Settings;
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction, pending] = useFormAction(action);
  return (
    <div className="stack">
      <form onSubmit={formAction} className="card stack">
        <div className="form-grid">
          <div className="field">
            <label htmlFor="s-name">Name</label>
            <input id="s-name" name="name" defaultValue={initial.name} required maxLength={120} />
          </div>
          <div className="field">
            <label htmlFor="s-status">Status</label>
            <select id="s-status" name="status" defaultValue={initial.status}>
              <option value="active">Active: taking submissions</option>
              <option value="paused">Paused: turn new submissions away</option>
            </select>
          </div>

          <div className="field full">
            <span className="field-label">Email me each submission</span>
            <label className="check">
              <input type="checkbox" name="notifyEnabled" defaultChecked={initial.notifyEnabled} />
              <span>Send a notification with the answers. Reply goes straight to the person.</span>
            </label>
            <textarea name="notifyEmails" defaultValue={initial.notifyEmails} rows={2} style={{ minHeight: 60 }} placeholder="you@quolume.com" aria-label="Notification addresses" />
            <span className="hint">One address per line, or separated by commas.</span>
          </div>

          <div className="field full">
            <label htmlFor="s-domains">Only accept submissions from</label>
            <textarea id="s-domains" name="allowedDomains" defaultValue={initial.allowedDomains} rows={2} style={{ minHeight: 60 }} placeholder="quolume.com" />
            <span className="hint">
              Your site&apos;s domain, one per line (subdomains included). Leave empty to accept from anywhere. Blocks
              people copying your endpoint onto their own site.
            </span>
          </div>

          <div className="field full">
            <label htmlFor="s-page">The page your form is on</label>
            <input id="s-page" name="pageUrl" type="url" defaultValue={initial.pageUrl} />
            <span className="hint">
              Read for every option your dropdowns and choices offer, so conditions can use them before anyone picks
              them. Filled in from your first submission; set it here if the form is on a different page.
              {initial.pageReadAt && ` Last read ${initial.pageReadAt}.`}
            </span>
          </div>

          <div className="field full">
            <label htmlFor="s-redirect">After submitting, send people to</label>
            <input id="s-redirect" name="redirectUrl" type="url" defaultValue={initial.redirectUrl} placeholder="https://quolume.com/thank-you" />
            <span className="hint">Optional. Leave empty to show the thank-you page below. An automation&apos;s Redirect step wins over this.</span>
          </div>
          <div className="field">
            <label htmlFor="s-title">Thank-you page heading</label>
            <input id="s-title" name="successTitle" defaultValue={initial.successTitle} maxLength={120} />
          </div>
          <div className="field">
            <label htmlFor="s-message">Thank-you page message</label>
            <textarea id="s-message" name="successMessage" defaultValue={initial.successMessage} rows={2} style={{ minHeight: 60 }} />
          </div>
        </div>
        <FormMessage state={state} />
        <div className="row">
          <button className="btn" type="submit" disabled={pending}>{pending ? "Saving…" : "Save settings"}</button>
        </div>
      </form>

      <div className="card spread">
        <div className="stack-sm">
          <h3>Delete this form</h3>
          <p className="muted">Removes the endpoint and every submission. Automations listening only to it stop starting.</p>
        </div>
        <ConfirmButton
          action={deleteFormAction.bind(null, formId)}
          label="Delete form"
          confirm="Delete this form and all of its submissions? This can't be undone."
        />
      </div>
    </div>
  );
}
