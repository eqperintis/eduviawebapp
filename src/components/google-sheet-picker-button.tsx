"use client";

import { useState } from "react";
import { getGooglePickerTokenAction } from "@/lib/actions/google";

/**
 * The bits of the `gapi`/`google.picker` globals this component actually
 * calls — loaded at runtime from Google's own script, so there's no package
 * to import types from. Kept narrow rather than reaching for `any`.
 */
type GapiGlobal = { load: (api: string, callback: () => void) => void };
type PickerDocument = { id: string; name: string };
type PickerResponse = { action: string; docs?: PickerDocument[] };
type PickerBuilder = {
  addView: (view: unknown) => PickerBuilder;
  setOAuthToken: (token: string) => PickerBuilder;
  setDeveloperKey: (key: string) => PickerBuilder;
  setAppId: (appId: string) => PickerBuilder;
  setCallback: (callback: (data: PickerResponse) => void) => PickerBuilder;
  build: () => { setVisible: (visible: boolean) => void };
};
type PickerGlobal = {
  PickerBuilder: new () => PickerBuilder;
  DocsView: new (viewId: unknown) => unknown;
  ViewId: { SPREADSHEETS: unknown };
  Action: { PICKED: string };
};
declare global {
  interface Window {
    gapi?: GapiGlobal;
    google?: { picker: PickerGlobal };
  }
}

let scriptLoadPromise: Promise<void> | null = null;

function loadGapiScript(): Promise<void> {
  if (window.gapi) return Promise.resolve();
  if (scriptLoadPromise) return scriptLoadPromise;

  scriptLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://apis.google.com/js/api.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Couldn't load Google's picker script."));
    document.head.appendChild(script);
  });
  return scriptLoadPromise;
}

/** Opens Google's own file picker, showing only spreadsheets, and hands back
 * the chosen file's URL and name. Runs on the account connected on the
 * Account page (ported from SEKOOL). */
export function GoogleSheetPickerButton({
  apiKey,
  appId,
  onPick,
  label = "Choose from Google Drive",
}: {
  apiKey: string;
  /** The Cloud project number: without it, a file picked under drive.file isn't shared with the app. */
  appId: string | null;
  onPick: (result: { url: string; name: string }) => void;
  label?: string;
}) {
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function openPicker() {
    setStatus("loading");
    setError(null);

    const tokenResult = await getGooglePickerTokenAction();
    if ("error" in tokenResult) {
      setStatus("error");
      setError(tokenResult.error);
      return;
    }

    try {
      await loadGapiScript();
    } catch {
      setStatus("error");
      setError("Couldn't load Google's picker — check your connection and try again.");
      return;
    }

    window.gapi?.load("picker", () => {
      setStatus("idle");
      const picker = window.google?.picker;
      if (!picker) return;

      let builder = new picker.PickerBuilder()
        .addView(new picker.DocsView(picker.ViewId.SPREADSHEETS))
        .setOAuthToken(tokenResult.accessToken)
        .setDeveloperKey(apiKey);
      if (appId) builder = builder.setAppId(appId);
      builder
        .setCallback((data: PickerResponse) => {
          if (data.action !== picker.Action.PICKED || !data.docs?.[0]) return;
          const doc = data.docs[0];
          onPick({ url: `https://docs.google.com/spreadsheets/d/${doc.id}/edit`, name: doc.name });
        })
        .build()
        .setVisible(true);
    });
  }

  return (
    <div className="stack-sm">
      <button type="button" onClick={openPicker} disabled={status === "loading"} className="btn ghost sm" style={{ justifySelf: "start" }}>
        {status === "loading" ? "Opening…" : label}
      </button>
      {error && <p className="notice bad">{error}</p>}
    </div>
  );
}
