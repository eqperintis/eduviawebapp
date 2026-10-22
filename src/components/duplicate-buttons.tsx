"use client";

import { duplicateFormAction } from "@/lib/actions/forms";
import { duplicateAutomationAction } from "@/lib/actions/automations";
import { CreateDialog } from "@/components/create-dialog";

/** Duplicate, then a name for the copy: its settings and learned fields, under a new endpoint. */
export function DuplicateFormButton({
  form,
  automationCount,
  className = "btn ghost sm",
}: {
  form: { id: string; name: string };
  /** How many automations this form starts, to offer copying them too. */
  automationCount: number;
  className?: string;
}) {
  return (
    <CreateDialog
      buttonLabel="Duplicate"
      buttonIcon={null}
      buttonClassName={className}
      title={`Duplicate “${form.name}”`}
      nameLabel="Name of the copy"
      submitLabel="Duplicate form"
      initialName={`Copy of ${form.name}`.slice(0, 120)}
      action={duplicateFormAction.bind(null, form.id)}
    >
      <p className="muted">The copy gets its own endpoint and the same settings. Submissions stay with the original.</p>
      {automationCount > 0 && (
        <label className="check">
          <input type="checkbox" name="withAutomations" defaultChecked />
          <span>
            Also copy the {automationCount === 1 ? "automation" : `${automationCount} automations`} it starts, for the new form
            <span className="muted"> ({automationCount === 1 ? "as a draft, so it doesn't run until you turn it on" : "as drafts, so they don't run until you turn them on"})</span>
          </span>
        </label>
      )}
    </CreateDialog>
  );
}

/** Duplicate, then a name for the copy: the whole flow, started by the same forms, as a draft. */
export function DuplicateAutomationButton({
  automation,
  className = "btn ghost sm",
}: {
  automation: { id: string; name: string };
  className?: string;
}) {
  return (
    <CreateDialog
      buttonLabel="Duplicate"
      buttonIcon={null}
      buttonClassName={className}
      title={`Duplicate “${automation.name}”`}
      nameLabel="Name of the copy"
      submitLabel="Duplicate automation"
      initialName={`Copy of ${automation.name}`.slice(0, 120)}
      action={duplicateAutomationAction.bind(null, automation.id)}
    >
      <p className="muted">Every step is copied, started by the same forms. The copy starts as a draft. Runs stay with the original.</p>
    </CreateDialog>
  );
}
