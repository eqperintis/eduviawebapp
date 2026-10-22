"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addStepAction,
  deleteAutomationAction,
  setAutomationStatusAction,
  updateAutomationAction,
} from "@/lib/actions/automations";
import { childAt, describeNode, STEP_TYPES, type StoredNode } from "@/lib/automations/flow";
import type { TriggerDefinition } from "@/lib/automations/triggers";
import { ConfirmButton } from "@/components/confirm-button";
import { StepEditor } from "./step-editor";

const ICONS: Record<string, string> = {
  trigger: "⚡",
  send_email: "✉",
  notify: "🔔",
  condition: "⑂",
  wait: "⏱",
  redirect: "↗",
  webhook: "⇄",
  google_sheets: "▦",
};

type Props = {
  automation: { id: string; name: string; status: string };
  nodes: StoredNode[];
  trigger: TriggerDefinition;
  forms: { id: string; name: string }[];
  selectedFormIds: string[];
  /** For the Google Sheets step: is an account connected, and the Picker's key. */
  google: { connected: boolean; pickerApiKey: string | null; appId: string | null };
};

function isUnset(node: StoredNode): boolean {
  switch (node.type) {
    case "send_email":
      return !node.subject || !node.content;
    case "notify":
      return !node.recipients;
    case "redirect":
    case "webhook":
    case "google_sheets":
      return !node.url;
    case "condition":
      return !node.conditionField || !node.conditionOperator;
    case "wait":
      return !node.delayMinutes;
    default:
      return false;
  }
}

export function Builder({ automation, nodes, trigger, forms, selectedFormIds, google }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const root = nodes.find((node) => node.type === "trigger");
  const selectedNode = nodes.find((node) => node.id === selected && node.type !== "trigger");

  const add = (parentId: string, branch: string, type: string) => {
    setMenu(null);
    setError(null);
    start(async () => {
      const result = await addStepAction(automation.id, parentId, branch, type);
      if (!result.ok) return setError(result.error);
      setSelected(result.id ?? null);
      router.refresh();
    });
  };

  const renderSlot = (parentId: string, branch: string): React.ReactNode => {
    const slotKey = `${parentId}:${branch}`;
    const child = childAt(nodes, parentId, branch);
    return (
      <div className="flow-col">
        <div className="connector" />
        <button
          type="button"
          className="add-step"
          aria-label="Add a step here"
          aria-expanded={menu === slotKey}
          disabled={pending}
          onClick={() => setMenu(menu === slotKey ? null : slotKey)}
        >
          +
        </button>
        {menu === slotKey && (
          <div className="add-menu" role="menu">
            {STEP_TYPES.map((step) => (
              <button key={step.type} type="button" role="menuitem" onClick={() => add(parentId, branch, step.type)}>
                <span>
                  {ICONS[step.type]} {step.label}
                </span>
                <small>{step.help}</small>
              </button>
            ))}
          </div>
        )}
        {child ? (
          <>
            <div className="connector" />
            {renderStep(child)}
          </>
        ) : (
          <span className="end">End</span>
        )}
      </div>
    );
  };

  const renderStep = (node: StoredNode): React.ReactNode => {
    const summary = describeNode(node, trigger);
    const card = (
      <button
        type="button"
        className={`step${node.type === "trigger" ? " trigger" : ""}${isUnset(node) ? " unset" : ""}`}
        aria-pressed={selected === node.id}
        onClick={() => {
          setSelected(node.type === "trigger" ? null : node.id);
          // On a phone the editor sits below the flow: bring it into view.
          requestAnimationFrame(() => {
            if (window.innerWidth < 900) document.getElementById("step-panel")?.scrollIntoView({ behavior: "smooth" });
          });
        }}
      >
        <span className="kind">
          <i aria-hidden="true">{ICONS[node.type] ?? "•"}</i>
          {summary.title}
        </span>
        <span className="detail">{summary.detail}</span>
      </button>
    );
    if (node.type === "condition") {
      return (
        <Fragment key={node.id}>
          {card}
          <div className="connector" />
          <div className="branches">
            {(["yes", "no"] as const).map((branch) => (
              <div className="branch" key={branch}>
                <span className={`branch-label ${branch}`}>{branch === "yes" ? "Yes" : "No"}</span>
                {renderSlot(node.id, branch)}
              </div>
            ))}
          </div>
        </Fragment>
      );
    }
    return (
      <Fragment key={node.id}>
        {card}
        {renderSlot(node.id, "main")}
      </Fragment>
    );
  };

  return (
    <div className="grid-side">
      <div className="card" style={{ padding: "20px 12px" }}>
        {error && <p className="notice bad" role="alert" style={{ marginBottom: 12 }}>{error}</p>}
        <div className="flow">{root ? renderStep(root) : <p className="muted">This automation has no trigger.</p>}</div>
      </div>
      <div className="panel-sticky stack" id="step-panel">
        {selectedNode ? (
          <StepEditor
            google={google}
            key={selectedNode.id}
            node={selectedNode}
            nodes={nodes}
            trigger={trigger}
            onDone={() => router.refresh()}
            onDeleted={() => {
              setSelected(null);
              router.refresh();
            }}
            onClose={() => setSelected(null)}
          />
        ) : (
          <AutomationSettings automation={automation} forms={forms} selectedFormIds={selectedFormIds} />
        )}
      </div>
    </div>
  );
}

function AutomationSettings({
  automation,
  forms,
  selectedFormIds,
}: Pick<Props, "automation" | "forms" | "selectedFormIds">) {
  const router = useRouter();
  const [name, setName] = useState(automation.name);
  const [formIds, setFormIds] = useState(selectedFormIds);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const setStatus = (status: string) =>
    start(async () => {
      const result = await setAutomationStatusAction(automation.id, status);
      setMessage(result.ok ? null : { ok: false, text: result.error });
      router.refresh();
    });

  const statusText: Record<string, string> = {
    draft: "Draft: not running. Build the flow, then turn it on.",
    active: "On: runs for every new submission.",
    paused: "Paused: new submissions don't start it, and runs in progress hold where they are.",
  };

  return (
    <>
      <div className="card stack">
        <div className="spread">
          <h2>Status</h2>
          <span className={`pill ${automation.status === "active" ? "ok" : automation.status === "paused" ? "warn" : ""}`}>
            {automation.status}
          </span>
        </div>
        <p className="muted">{statusText[automation.status]}</p>
        <div className="row">
          {automation.status !== "active" && (
            <button className="btn" type="button" disabled={pending} onClick={() => setStatus("active")}>Turn on</button>
          )}
          {automation.status === "active" && (
            <button className="btn ghost" type="button" disabled={pending} onClick={() => setStatus("paused")}>Pause</button>
          )}
        </div>
        {message && <p className={`notice ${message.ok ? "ok" : "bad"}`}>{message.text}</p>}
      </div>

      <form
        className="card stack"
        onSubmit={(event) => {
          event.preventDefault();
          start(async () => {
            const result = await updateAutomationAction(automation.id, { name, formIds });
            setMessage(result.ok ? { ok: true, text: "Saved." } : { ok: false, text: result.error });
            router.refresh();
          });
        }}
      >
        <h2>Settings</h2>
        <div className="field">
          <label htmlFor="au-name">Name</label>
          <input id="au-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required />
        </div>
        <div className="field">
          <span className="field-label">Starts when someone submits</span>
          {forms.map((form) => (
            <label className="check" key={form.id}>
              <input
                type="checkbox"
                checked={formIds.includes(form.id)}
                onChange={(event) =>
                  setFormIds((current) => (event.target.checked ? [...current, form.id] : current.filter((id) => id !== form.id)))
                }
              />
              <span>{form.name}</span>
            </label>
          ))}
          <span className="hint">With several forms, conditions can check which one they came from.</span>
        </div>
        <div className="row">
          <button className="btn" type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
        </div>
        <p className="faint" style={{ fontSize: "0.82rem" }}>Click a step in the flow to edit it, or + to add one.</p>
      </form>

      <div className="card spread">
        <span className="muted">Delete this automation and its run history.</span>
        <ConfirmButton
          action={deleteAutomationAction.bind(null, automation.id)}
          label="Delete"
          confirm="Delete this automation? Runs in progress stop. This can't be undone."
        />
      </div>
    </>
  );
}
