import type { ReactNode } from "react";

/** The signed-out pages' frame: logo above one card. */
export function AuthShell({ title, intro, children }: { title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <div className="center">
      <div className="auth">
        <div className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/quolume-logo-horizontal.webp" alt="Quolume" width={176} height={40} />
          <small>Marketing</small>
        </div>
        <div className="card stack">
          <div className="stack-sm">
            <h1>{title}</h1>
            {intro && <p className="muted">{intro}</p>}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
