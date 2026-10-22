"use client";

import { createAutomationAction } from "@/lib/actions/automations";
import { CreateDialog } from "@/components/create-dialog";

export function NewAutomationButton({
  forms,
  lockedFormId,
  className,
}: {
  forms: { id: string; name: string }[];
  /** On a form's own Workflow tab: start from that form, no picker. */
  lockedFormId?: string;
  className?: string;
}) {
  return (
    <CreateDialog
      buttonLabel="New automation"
      title="New automation"
      nameLabel="Automation name"
      submitLabel="Create automation"
      action={createAutomationAction}
      buttonClassName={className}
    >
      {lockedFormId ? (
        <input type="hidden" name="formIds" value={lockedFormId} />
      ) : (
        <div className="field">
          <span className="field-label">Starts when someone submits</span>
          <div className="stack-sm">
            {forms.map((form) => (
              <label key={form.id} className="check">
                <input type="checkbox" name="formIds" value={form.id} defaultChecked={forms.length === 1} />
                <span>{form.name}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </CreateDialog>
  );
}
