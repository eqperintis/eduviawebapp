"use client";

import { useTransition } from "react";

/** A destructive button that asks first. `action` is a bound server action. */
export function ConfirmButton({
  action,
  label,
  confirm,
  className = "btn danger sm",
}: {
  action: () => Promise<unknown>;
  label: string;
  confirm: string;
  className?: string;
}) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className={className}
      disabled={pending}
      onClick={() => {
        if (!window.confirm(confirm)) return;
        start(async () => {
          await action();
        });
      }}
    >
      {pending ? "Working…" : label}
    </button>
  );
}
