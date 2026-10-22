"use client";

import { useFormAction } from "@/components/use-form-action";
import { changePasswordAction } from "@/lib/actions/auth";
import { FormMessage } from "@/components/form-message";

export function PasswordForm() {
  const [state, action, pending] = useFormAction(changePasswordAction);
  return (
    <form onSubmit={action} className="card stack">
      <h2>Change password</h2>
      <div className="field">
        <label htmlFor="current">Current password</label>
        <input id="current" name="current" type="password" autoComplete="current-password" required />
      </div>
      <div className="field">
        <label htmlFor="next">New password</label>
        <input id="next" name="next" type="password" autoComplete="new-password" minLength={10} required />
      </div>
      <FormMessage state={state} />
      <div className="row">
        <button className="btn" type="submit" disabled={pending}>{pending ? "Saving…" : "Change password"}</button>
      </div>
    </form>
  );
}
