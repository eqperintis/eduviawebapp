"use client";

import { useState } from "react";
import { CopyButton } from "@/components/copy-button";

/** The "Use with AI assistants" prompt: collapsed by default, copyable whole. */
export function AiPromptCard({ prompt }: { prompt: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card stack">
      <div className="stack-sm">
        <p className="label">Use with AI assistants</p>
        <p className="muted">
          Working with AI? Copy this prompt into Claude, ChatGPT or Cursor and it can build the form into your site,
          with the right endpoint, your fields and eduvia.my&apos;s look.
        </p>
      </div>
      <div className={`code prompt${open ? " open" : ""}`}>
        <pre>{prompt}</pre>
        <div className="copy">
          <CopyButton text={prompt} label="Copy prompt" />
        </div>
        <button type="button" className="show-more" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "Show less" : "Show more"}
        </button>
      </div>
    </div>
  );
}
