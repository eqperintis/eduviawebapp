"use client";

import Link from "next/link";
import { useFormAction } from "@/components/use-form-action";
import { requestPasswordResetAction } from "@/lib/actions/password-reset";

export function ForgotPasswordForm() {
  const [state, action, pending] = useFormAction(requestPasswordResetAction);
  if (state?.ok) {
    return (
      <div className="stack">
        <p className="notice ok" role="status">{state.ok}</p>
        <Link href="/login" className="btn ghost">Back to sign in</Link>
      </div>
    );
  }
  return (
    <form onSubmit={action} className="stack">
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      {state?.error && <p className="notice bad" role="alert">{state.error}</p>}
      <button className="btn" type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </button>
      <Link href="/login" className="small-link center-text">Back to sign in</Link>
    </form>
  );
}
