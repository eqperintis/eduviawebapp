"use client";

import { createFormAction } from "@/lib/actions/forms";
import { CreateDialog } from "@/components/create-dialog";

export function NewFormButton({ className }: { className?: string }) {
  return (
    <CreateDialog
      buttonLabel="New form"
      title="New form"
      nameLabel="Form name"
      submitLabel="Create form"
      action={createFormAction}
      buttonClassName={className}
    />
  );
}
