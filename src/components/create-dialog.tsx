"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { FormState } from "@/lib/actions/auth";
import { useFormAction } from "@/components/use-form-action";
import { FormMessage } from "@/components/form-message";

/**
 * How everything new is created in this app, like Formspree's "+ Add New":
 * a button first, and only after pressing it a small dialog asking for a
 * name. Nothing sits on the page waiting to be typed into. Duplicate and
 * Rename use it too, with the name filled in.
 */
export function CreateDialog({
  buttonLabel,
  title,
  nameLabel = "Name",
  submitLabel = "Create",
  action,
  children,
  buttonClassName = "btn",
  buttonIcon = "+",
  initialName = "",
  pendingLabel = "Creating…",
  closeOnSuccess = false,
}: {
  buttonLabel: string;
  title: string;
  nameLabel?: string;
  submitLabel?: string;
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  /** Extra inputs under the name, e.g. which forms start an automation. */
  children?: React.ReactNode;
  buttonClassName?: string;
  /** Shown before the button label; null for none. */
  buttonIcon?: string | null;
  /** What the name starts as, e.g. "Copy of Enquiry". Selected on open, so typing replaces it. */
  initialName?: string;
  pendingLabel?: string;
  /** For an action that stays on the page (Rename): close once it succeeds. */
  closeOnSuccess?: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputId = useId();
  const [name, setName] = useState(initialName);
  const [state, submit, pending] = useFormAction(action);

  useEffect(() => {
    if (closeOnSuccess && state?.ok) dialogRef.current?.close();
  }, [closeOnSuccess, state]);

  const close = () => {
    dialogRef.current?.close();
    setName(initialName);
  };

  return (
    <>
      <button
        type="button"
        className={buttonClassName}
        onClick={() => {
          dialogRef.current?.showModal();
          const input = document.getElementById(inputId) as HTMLInputElement | null;
          input?.focus();
          input?.select();
        }}
      >
        {buttonIcon && <span aria-hidden="true">{buttonIcon}</span>} {buttonLabel}
      </button>
      <dialog
        ref={dialogRef}
        className="sheet"
        aria-label={title}
        onClick={(event) => {
          // A click on the backdrop (the dialog itself, outside the card) closes it.
          if (event.target === dialogRef.current) close();
        }}
        onClose={() => setName(initialName)}
      >
        <form onSubmit={submit} className="card stack">
          <h2>{title}</h2>
          <div className="field">
            <label htmlFor={inputId}>{nameLabel}</label>
            <input
              id={inputId}
              name="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={120}
              autoComplete="off"
            />
          </div>
          {children}
          <FormMessage state={closeOnSuccess ? (state?.error ? { error: state.error } : undefined) : state} />
          <div className="row">
            <button className="btn" type="submit" disabled={pending || !name.trim()}>
              {pending ? pendingLabel : submitLabel}
            </button>
            <button className="btn ghost" type="button" onClick={close}>
              Cancel
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
