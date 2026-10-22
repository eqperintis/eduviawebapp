"use client";

import Link from "next/link";
import { useFormAction } from "@/components/use-form-action";
import { loginAction } from "@/lib/actions/auth";

export function LoginForm() {
  const [state, action, pending] = useFormAction(loginAction);
  return (
    <form onSubmit={action} className="stack">
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="field">
        <div className="label-row">
          <label htmlFor="password">Password</label>
          <Link href="/forgot-password" className="small-link">
            Forgot password?
          </Link>
        </div>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {state?.error && <p className="notice bad" role="alert">{state.error}</p>}
      <button className="btn" type="submit" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
