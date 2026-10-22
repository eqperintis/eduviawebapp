"use client";

import { useId, useRef, useState } from "react";
import type { FormState } from "@/lib/actions/auth";
import { useFormAction } from "@/components/use-form-action";
import { FormMessage } from "@/components/form-message";

/**
 * How everything new is created in this app, like Formspree's "+ Add New":
 * a button first, and only after pressing it a small dialog asking for a
 * name. Nothing sits on the page waiting to be typed into.
 */
export function CreateDialog({
  buttonLabel,
  title,
  nameLabel = "Name",
  submitLabel = "Create",
  action,
  children,
  buttonClassName = "btn",
}: {
  buttonLabel: string;
  title: string;
  nameLabel?: string;
  submitLabel?: string;
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  /** Extra inputs under the name, e.g. which forms start an automation. */
  children?: React.ReactNode;
  buttonClassName?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputId = useId();
  const [name, setName] = useState("");
  const [state, submit, pending] = useFormAction(action);

  const close = () => {
    dialogRef.current?.close();
    setName("");
  };

  return (
    <>
      <button
        type="button"
        className={buttonClassName}
        onClick={() => {
          dialogRef.current?.showModal();
          document.getElementById(inputId)?.focus();
        }}
      >
        <span aria-hidden="true">+</span> {buttonLabel}
      </button>
      <dialog
        ref={dialogRef}
        className="sheet"
        aria-label={title}
        onClick={(event) => {
          // A click on the backdrop (the dialog itself, outside the card) closes it.
          if (event.target === dialogRef.current) close();
        }}
        onClose={() => setName("")}
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
          <FormMessage state={state} />
          <div className="row">
            <button className="btn" type="submit" disabled={pending || !name.trim()}>
              {pending ? "Creating…" : submitLabel}
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
