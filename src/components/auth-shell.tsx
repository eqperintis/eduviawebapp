import type { ReactNode } from "react";
import { BRAND, LOGO } from "@/lib/brand";

/** The signed-out pages' frame: logo above one card. */
export function AuthShell({ title, intro, children }: { title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <div className="center">
      <div className="auth">
        <div className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO.web} alt={BRAND.name} width={156} height={40} />
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
