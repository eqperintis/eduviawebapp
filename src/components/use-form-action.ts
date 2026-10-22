"use client";

import { startTransition, useActionState, type FormEvent } from "react";
import type { FormState } from "@/lib/actions/auth";

/**
 * useActionState, submitted by hand. Passing an action to <form action>
 * makes React clear the form afterwards, so a validation error would wipe
 * what the person just typed. Submitting through onSubmit keeps it.
 */
export function useFormAction(action: (prev: FormState, formData: FormData) => Promise<FormState>) {
  const [state, dispatch, pending] = useActionState(action, undefined);
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => dispatch(formData));
  };
  return [state, onSubmit, pending] as const;
}
