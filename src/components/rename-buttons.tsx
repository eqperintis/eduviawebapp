"use client";

import { renameFormAction } from "@/lib/actions/forms";
import { renameAutomationAction } from "@/lib/actions/automations";
import { CreateDialog } from "@/components/create-dialog";

/** Rename, then the new name in the same small dialog as New and Duplicate. */
export function RenameFormButton({ form, className = "btn ghost sm" }: { form: { id: string; name: string }; className?: string }) {
  return (
    <CreateDialog
      buttonLabel="Rename"
      buttonIcon={null}
      buttonClassName={className}
      title="Rename form"
      nameLabel="Form name"
      submitLabel="Save name"
      pendingLabel="Saving…"
      initialName={form.name}
      closeOnSuccess
      action={renameFormAction.bind(null, form.id)}
    >
      <p className="muted">Only the name changes. The endpoint stays the same, so your website keeps working.</p>
    </CreateDialog>
  );
}

export function RenameAutomationButton({
  automation,
  className = "btn ghost sm",
}: {
  automation: { id: string; name: string };
  className?: string;
}) {
  return (
    <CreateDialog
      buttonLabel="Rename"
      buttonIcon={null}
      buttonClassName={className}
      title="Rename automation"
      nameLabel="Automation name"
      submitLabel="Save name"
      pendingLabel="Saving…"
      initialName={automation.name}
      closeOnSuccess
      action={renameAutomationAction.bind(null, automation.id)}
    />
  );
}
