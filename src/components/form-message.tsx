import type { FormState } from "@/lib/actions/auth";

export function FormMessage({ state }: { state: FormState }) {
  if (state?.error) return <p className="notice bad" role="alert">{state.error}</p>;
  if (state?.ok) return <p className="notice ok" role="status">{state.ok}</p>;
  return null;
}
