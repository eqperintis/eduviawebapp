"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { deleteStepAction, sendTestEmailAction, updateStepAction, type StepInput } from "@/lib/actions/automations";
import { RichTextEditor, useEmailEditor } from "@/components/rich-text-editor";
import { loadGoogleSheetColumnsAction, loadGoogleSheetTabsAction } from "@/lib/actions/google";
import {
  columnSources,
  defaultColumns,
  mergeColumns,
  parseColumns,
  SUBMITTED_AT,
  type SheetColumn,
} from "@/lib/automations/sheet-columns";
import { GoogleSheetPickerButton } from "@/components/google-sheet-picker-button";
import { operatorsForField, type OperatorDefinition } from "@/lib/automations/conditions";
import { reachedAtSubmit } from "@/lib/automations/submit-redirect";
import { BUILT_IN_VARIABLES, describeNode, parseOperand, type StoredNode } from "@/lib/automations/flow";
import { fieldOrTyped, getTriggerField, type TriggerDefinition, type TriggerField } from "@/lib/automations/triggers";

type Props = {
  node: StoredNode;
  nodes: StoredNode[];
  trigger: TriggerDefinition;
  onDone: () => void;
  onDeleted: () => void;
  onClose: () => void;
  google: { connected: boolean; pickerApiKey: string | null; appId: string | null };
};

const UNITS = [
  { value: 1, label: "minutes" },
  { value: 60, label: "hours" },
  { value: 1440, label: "days" },
];

function splitDelay(minutes: number | null): { amount: number; unit: number } {
  const total = minutes ?? 1440;
  if (total % 1440 === 0) return { amount: total / 1440, unit: 1440 };
  if (total % 60 === 0) return { amount: total / 60, unit: 60 };
  return { amount: total, unit: 1 };
}

export function StepEditor({ node, nodes, trigger, onDone, onDeleted, onClose, google }: Props) {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  // One state object per step type keeps every input controlled.
  const [recipients, setRecipients] = useState(node.recipients ?? "");
  const [subject, setSubject] = useState(node.subject ?? "");
  const [content, setContent] = useState(node.content ?? "");
  const [ctaLabel, setCtaLabel] = useState(node.ctaLabel ?? "");
  const [url, setUrl] = useState(node.url ?? "");
  const initialDelay = splitDelay(node.delayMinutes);
  const [amount, setAmount] = useState(String(initialDelay.amount));
  const [unit, setUnit] = useState(initialDelay.unit);
  const [field, setField] = useState(node.conditionField ?? "");
  const [operator, setOperator] = useState(node.conditionOperator ?? "");
  const [operands, setOperands] = useState<string[]>(parseOperand(node.conditionValue));
  const [columns, setColumns] = useState<SheetColumn[]>(() => (node.type === "google_sheets" ? parseColumns(node.content) : []));

  const summary = describeNode(node, trigger);
  const answerFields = trigger.fields.filter((entry) => !entry.key.startsWith("_"));
  const isEmailStep = node.type === "send_email" || node.type === "notify";

  const save = () => {
    const input: StepInput = {};
    if (node.type === "send_email" || node.type === "notify") Object.assign(input, { recipients, subject, content, ctaLabel, url });
    if (node.type === "redirect" || node.type === "webhook") input.url = url;
    if (node.type === "google_sheets") Object.assign(input, { url, subject, ctaLabel, content: JSON.stringify(columns) });
    if (node.type === "wait") input.delayMinutes = Number(amount) * unit;
    if (node.type === "condition") Object.assign(input, { conditionField: field, conditionOperator: operator, conditionValue: operands });
    start(async () => {
      const result = await updateStepAction(node.id, input);
      setMessage(result.ok ? { ok: true, text: "Saved." } : { ok: false, text: result.error });
      if (result.ok) onDone();
    });
  };

  const remove = () => {
    const warning =
      node.type === "condition"
        ? "Remove this condition and every step under both of its branches?"
        : "Remove this step? The step after it moves up.";
    if (!window.confirm(warning)) return;
    start(async () => {
      const result = await deleteStepAction(node.id);
      if (!result.ok) return setMessage({ ok: false, text: result.error });
      onDeleted();
    });
  };

  const sendTest = () => {
    start(async () => {
      const result = await sendTestEmailAction(node.id, { subject, content, ctaLabel, url });
      setMessage(result.ok ? { ok: true, text: result.text } : { ok: false, text: result.error });
    });
  };

  return (
    <form
      className="card stack"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <div className="spread">
        <h2>{summary.title}</h2>
        <button type="button" className="btn ghost sm" onClick={onClose}>Close</button>
      </div>

      {node.type === "notify" && (
        <div className="field">
          <label htmlFor="st-recipients">Send to</label>
          <textarea id="st-recipients" rows={2} style={{ minHeight: 60 }} value={recipients} onChange={(event) => setRecipients(event.target.value)} placeholder="hello@eduvia.my" />
          <span className="hint">One address per line. Reply-To is the person who submitted.</span>
        </div>
      )}

      {(node.type === "send_email" || node.type === "notify") && (
        <>
          {node.type === "send_email" && (
            <p className="hint">Goes to the email they gave on the form. Skipped if they gave none or have unsubscribed.</p>
          )}
          <div className="field">
            <label htmlFor="st-subject">Subject</label>
            <input id="st-subject" value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={190} />
          </div>
          <EmailBody initial={node.content} onChange={setContent} answerFields={answerFields} />
          {node.type === "send_email" && (
            <div className="form-grid">
              <div className="field">
                <label htmlFor="st-cta">Button label</label>
                <input id="st-cta" value={ctaLabel} onChange={(event) => setCtaLabel(event.target.value)} placeholder="Book a call" />
              </div>
              <div className="field">
                <label htmlFor="st-cta-url">Button link</label>
                <input id="st-cta-url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://" />
              </div>
            </div>
          )}
        </>
      )}

      {node.type === "wait" && (
        <div className="field">
          <span className="field-label">Wait for</span>
          <div className="row" style={{ flexWrap: "nowrap" }}>
            <input type="number" min={1} value={amount} onChange={(event) => setAmount(event.target.value)} aria-label="Amount" style={{ maxWidth: 110 }} />
            <select value={unit} onChange={(event) => setUnit(Number(event.target.value))} aria-label="Unit">
              {UNITS.map((entry) => (
                <option key={entry.value} value={entry.value}>{entry.label}</option>
              ))}
            </select>
          </div>
          <span className="hint">Resumes on the next cron run after the wait (every 5 minutes).</span>
        </div>
      )}

      {node.type === "redirect" && (
        <>
          <div className="field">
            <label htmlFor="st-url">Send them to</label>
            <input id="st-url" type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://eduvia.my/next-step" />
          </div>
          {reachedAtSubmit(nodes, node.parentId) ? (
            <p className="notice">Happens the moment they submit. Put it under a Condition to send different answers to different pages.</p>
          ) : (
            <p className="notice warn">This is after a Wait, so they&apos;ve left the page by then. It won&apos;t do anything here.</p>
          )}
        </>
      )}

      {node.type === "webhook" && (
        <>
          <div className="field">
            <label htmlFor="st-hook">POST to</label>
            <input id="st-hook" type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://hooks.zapier.com/…" />
          </div>
          <div className="code">
            <pre>{`{
  "event": "form.submitted",
  "form": { "id": "…", "name": "…" },
  "submission": {
    "id": "…", "submittedAt": "…",
    "email": "…", "name": "…",
    "data": { ${answerFields.slice(0, 3).map((entry) => `"${entry.key}": "…"`).join(", ")} }
  }
}`}</pre>
          </div>
        </>
      )}

      {node.type === "google_sheets" && (
        <SheetFields
          google={google}
          fields={trigger.fields}
          columns={columns}
          onColumns={setColumns}
          url={url}
          name={subject}
          tab={ctaLabel}
          onPick={(picked) => {
            setUrl(picked.url);
            setSubject(picked.name);
          }}
          onTab={setCtaLabel}
        />
      )}

      {node.type === "condition" && (
        <ConditionFields
          trigger={trigger}
          field={field}
          operator={operator}
          operands={operands}
          onField={(next, typing) => {
            setField(next);
            const def = fieldOrTyped(trigger, next);
            const valid = def ? operatorsForField(def) : [];
            // While a name is being typed, keep what's already chosen if it still fits.
            setOperator((current) => (typing && valid.some((op) => op.value === current) ? current : valid[0]?.value ?? ""));
            if (!typing) setOperands([]);
          }}
          onOperator={(next) => {
            setOperator(next);
            setOperands([]);
          }}
          onOperands={setOperands}
        />
      )}

      {message && <p className={`notice ${message.ok ? "ok" : "bad"}`} role="status">{message.text}</p>}
      <div className="spread">
        <div className="row">
          <button className="btn" type="submit" disabled={pending}>{pending ? "Working…" : "Save step"}</button>
          {isEmailStep && (
            <button className="btn ghost sm" type="button" disabled={pending} onClick={sendTest}>
              Send me a test
            </button>
          )}
        </div>
        <button className="btn danger sm" type="button" disabled={pending} onClick={remove}>Remove step</button>
      </div>
    </form>
  );
}

/** Pick a spreadsheet from Google Drive and a tab, then say what goes in each of its columns. */
function SheetFields({
  google,
  fields,
  columns,
  onColumns,
  url,
  name,
  tab,
  onPick,
  onTab,
}: {
  google: { connected: boolean; pickerApiKey: string | null; appId: string | null };
  fields: TriggerField[];
  columns: SheetColumn[];
  onColumns: (columns: SheetColumn[]) => void;
  url: string;
  name: string;
  tab: string;
  onPick: (picked: { url: string; name: string }) => void;
  onTab: (tab: string) => void;
}) {
  const [tabs, setTabs] = useState<string[]>([]);
  const [loading, setLoading] = useState<"tabs" | "columns" | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Rows that came from the sheet itself keep their header; added ones can be renamed.
  const [sheetHeaders, setSheetHeaders] = useState<string[]>([]);

  const loadColumns = async (sheetUrl: string, tabName: string, saved: SheetColumn[]) => {
    if (!tabName) return;
    setLoading("columns");
    const result = await loadGoogleSheetColumnsAction(sheetUrl, tabName);
    setLoading(null);
    if ("error" in result) return setError(result.error);
    const headers = result.headers.filter((header) => header.trim());
    setSheetHeaders(headers);
    // An empty tab gets a sensible starting set; otherwise follow the sheet.
    onColumns(headers.length === 0 && saved.length === 0 ? defaultColumns(fields) : mergeColumns(headers, saved, fields));
  };

  const loadTabs = async (sheetUrl: string, keep: string, saved: SheetColumn[]) => {
    setLoading("tabs");
    setError(null);
    const result = await loadGoogleSheetTabsAction(sheetUrl);
    setLoading(null);
    if ("error" in result) return setError(result.error);
    setTabs(result.tabs);
    const chosen = result.tabs.includes(keep) ? keep : result.tabs[0] ?? "";
    onTab(chosen);
    await loadColumns(sheetUrl, chosen, saved);
  };

  // Opening a step that already has a sheet: fetch its tabs and columns once.
  const [opened] = useState({ url, tab, columns });
  useEffect(() => {
    if (!google.connected || !opened.url) return;
    let cancelled = false;
    // Started after the effect, not inside it: loading updates state.
    void Promise.resolve().then(() => {
      if (!cancelled) void loadTabs(opened.url, opened.tab, opened.columns);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!google.connected) {
    return (
      <p className="notice warn">
        Connect Google on the <Link href="/account">Account page</Link> first, then come back to choose a sheet.
      </p>
    );
  }
  if (!google.pickerApiKey) {
    return <p className="notice warn">The Google Picker isn&apos;t set up on the server yet (GOOGLE_PICKER_API_KEY).</p>;
  }

  const sources = columnSources(fields);
  const sourceValues = new Set(sources.map((source) => source.value));
  const fieldSources = sources.filter((source) => source.value !== SUBMITTED_AT.value);
  const setColumn = (index: number, patch: Partial<SheetColumn>) =>
    onColumns(columns.map((column, i) => (i === index ? { ...column, ...patch } : column)));

  return (
    <>
      <div className="field">
        <span className="field-label">Spreadsheet</span>
        {url && (
          <p>
            <a href={url} target="_blank" rel="noreferrer">
              {name || "Chosen spreadsheet"}
            </a>
          </p>
        )}
        <GoogleSheetPickerButton
          apiKey={google.pickerApiKey}
          appId={google.appId}
          label={url ? "Choose a different sheet" : "Choose from Google Drive"}
          onPick={(picked) => {
            onPick(picked);
            void loadTabs(picked.url, "", []);
          }}
        />
      </div>

      {url && (
        <div className="field">
          <label htmlFor="st-tab">Tab</label>
          {tabs.length > 0 ? (
            <select
              id="st-tab"
              value={tab}
              onChange={(event) => {
                onTab(event.target.value);
                void loadColumns(url, event.target.value, []);
              }}
            >
              {tabs.map((entry) => (
                <option key={entry} value={entry}>{entry}</option>
              ))}
            </select>
          ) : (
            <p className="muted">{loading === "tabs" ? "Loading tabs…" : tab || "Sheet1"}</p>
          )}
        </div>
      )}

      {error && <p className="notice bad">{error}</p>}

      {url && tab && (
        <div className="field">
          <div className="spread">
            <span className="field-label">Columns</span>
            <button
              type="button"
              className="btn ghost sm"
              disabled={loading !== null}
              onClick={() => loadColumns(url, tab, columns)}
              title="Read the sheet's header row again"
            >
              {loading === "columns" ? "Reading…" : "Refresh"}
            </button>
          </div>
          <span className="hint">
            What each column gets for every new submission. Form fields are the ones this form has actually sent, so
            they show up after its first submission.
          </span>
          <ol className="columns">
            {columns.map((column, index) => {
              const fromSheet = sheetHeaders.includes(column.header);
              const custom = column.value !== "" && !sourceValues.has(column.value);
              return (
                <li key={index}>
                  {fromSheet ? (
                    <span className="column-name">{column.header}</span>
                  ) : (
                    <input
                      aria-label="New column name"
                      value={column.header}
                      placeholder="New column"
                      onChange={(event) => setColumn(index, { header: event.target.value })}
                    />
                  )}
                  <select
                    aria-label={`What goes in ${column.header || "this column"}`}
                    value={custom ? "__custom" : column.value}
                    onChange={(event) =>
                      setColumn(index, { value: event.target.value === "__custom" ? " " : event.target.value })
                    }
                  >
                    <option value="">Leave empty</option>
                    <option value={SUBMITTED_AT.value}>{SUBMITTED_AT.label}</option>
                    <optgroup label="Form fields">
                      {fieldSources.length === 0 ? (
                        <option disabled value="__none">None yet: they appear after the first submission</option>
                      ) : (
                        fieldSources.map((source) => (
                          <option key={source.value} value={source.value}>{source.label}</option>
                        ))
                      )}
                    </optgroup>
                    <option value="__custom">Text I type…</option>
                  </select>
                  {custom && (
                    <input
                      aria-label={`Text for ${column.header || "this column"}`}
                      value={column.value.trim() === "" ? "" : column.value}
                      placeholder="e.g. Website, or {{level}}"
                      onChange={(event) => setColumn(index, { value: event.target.value || " " })}
                      className="column-custom"
                    />
                  )}
                  {!fromSheet && (
                    <button
                      type="button"
                      className="btn ghost sm column-remove"
                      aria-label={`Remove ${column.header || "this column"}`}
                      onClick={() => onColumns(columns.filter((_, i) => i !== index))}
                    >
                      ✕
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
          <button
            type="button"
            className="btn ghost sm"
            style={{ justifySelf: "start" }}
            onClick={() => onColumns([...columns, { header: "", value: "" }])}
          >
            + Add a column
          </button>
          <span className="hint">New columns are added to the sheet&apos;s first row the first time a submission comes in.</span>
        </div>
      )}
    </>
  );
}

const TYPED = "__typed";

function ConditionFields({
  trigger,
  field,
  operator,
  operands,
  onField,
  onOperator,
  onOperands,
}: {
  trigger: TriggerDefinition;
  field: string;
  operator: string;
  operands: string[];
  onField: (value: string, typing: boolean) => void;
  onOperator: (value: string) => void;
  onOperands: (value: string[]) => void;
}) {
  // Like Formspree, nothing is set up in advance: pick a field the form has
  // sent, or type the name of one it will send.
  const [typing, setTyping] = useState(!!field && !getTriggerField(trigger, field));
  const def = fieldOrTyped(trigger, field);
  const operators = def ? operatorsForField(def) : [];
  const op = operators.find((entry) => entry.value === operator);

  const groups = new Map<string, TriggerField[]>();
  for (const entry of trigger.fields) {
    const group = entry.computed ? "Worked out by the app" : entry.group ?? "Questions on the form";
    groups.set(group, [...(groups.get(group) ?? []), entry]);
  }

  return (
    <>
      <div className="field">
        <label htmlFor="c-field">If</label>
        <select
          id="c-field"
          value={typing ? TYPED : field}
          onChange={(event) => {
            const next = event.target.value;
            setTyping(next === TYPED);
            onField(next === TYPED ? "" : next, false);
          }}
        >
          <option value="">Choose a field</option>
          {[...groups.entries()].map(([group, entries]) => (
            <optgroup key={group} label={group}>
              {entries.map((entry) => (
                <option key={entry.key} value={entry.key}>{entry.label}</option>
              ))}
            </optgroup>
          ))}
          <option value={TYPED}>Type a field name…</option>
        </select>
        {typing && (
          <input
            aria-label="Field name"
            value={field}
            placeholder="The input's name, e.g. level"
            onChange={(event) => onField(event.target.value, true)}
            className="mono"
          />
        )}
        {typing && <span className="hint">Exactly as the form sends it: the <code>name</code> on the input.</span>}
        {def?.hint && <span className="hint">{def.hint}</span>}
      </div>
      {def && (
        <div className="field">
          <label htmlFor="c-op">Is</label>
          <select id="c-op" value={operator} onChange={(event) => onOperator(event.target.value)}>
            {operators.map((entry) => (
              <option key={entry.value} value={entry.value}>{entry.label}</option>
            ))}
          </select>
        </div>
      )}
      {def && op && op.operands > 0 && <Operands def={def} op={op} operands={operands} onOperands={onOperands} />}
      <p className="hint">Matching people take the Yes branch, everyone else the No branch.</p>
    </>
  );
}

function Operands({
  def,
  op,
  operands,
  onOperands,
}: {
  def: TriggerField;
  op: OperatorDefinition;
  operands: string[];
  onOperands: (value: string[]) => void;
}) {
  const options = def.options ?? [];
  if (op.multiSelect && options.length > 0) {
    return <AnyOfSeen options={options} operands={operands} onOperands={onOperands} allowOthers={!op.fromOptions} />;
  }
  if (op.multiSelect) {
    return (
      <div className="field">
        <label htmlFor="c-val">Any of</label>
        <input
          id="c-val"
          value={operands.join(", ")}
          placeholder="Upper secondary, Pre-university"
          onChange={(event) => onOperands(event.target.value.split(",").map((value) => value.trim()))}
        />
        <span className="hint">Separate values with commas.</span>
      </div>
    );
  }
  if (op.fromOptions && options.length > 0) {
    return (
      <div className="field">
        <label htmlFor="c-val">Value</label>
        <select id="c-val" value={operands[0] ?? ""} onChange={(event) => onOperands([event.target.value])}>
          <option value="">Choose one</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>
    );
  }

  const type = op.dateOperand ? "date" : op.timeOperand ? "time" : def.kind === "number" ? "number" : "text";
  const count = op.operands === 2 ? 2 : 1;
  if (type === "text" && count === 1 && options.length > 0) {
    return (
      <div className="field">
        <label htmlFor="c-val">Value</label>
        <SeenValuePicker options={options} value={operands[0] ?? ""} onChange={(value) => onOperands([value])} />
      </div>
    );
  }
  return (
    <div className="field">
      <span className="field-label">{count === 2 ? "Between" : "Value"}</span>
      <div className="row" style={{ flexWrap: "nowrap" }}>
        {Array.from({ length: count }, (_, index) => (
          <OperandSlot key={index} index={index}>
            <input
              type={type}
              aria-label={count === 2 ? (index === 0 ? "From" : "To") : "Value"}
              value={operands[index] ?? ""}
              onChange={(event) => {
                const next = [...operands];
                next[index] = event.target.value;
                onOperands(next);
              }}
            />
          </OperandSlot>
        ))}
      </div>
    </div>
  );
}

/** The email itself: the rich editor, with the form's variables one click away. */
function EmailBody({
  initial,
  onChange,
  answerFields,
}: {
  initial: string | null;
  onChange: (html: string) => void;
  answerFields: TriggerField[];
}) {
  const editor = useEmailEditor(initial, onChange);
  const insert = (token: string) => editor?.chain().focus().insertContent(token).run();
  return (
    <div className="field">
      <span className="field-label">Email</span>
      <RichTextEditor editor={editor} />
      <span className="hint">Sent in the Eduvia look, with the logo. Select words, then use the link button to link them.</span>
      <div className="stack-sm">
        <span className="hint">Insert from the form:</span>
        <div className="chips">
          {BUILT_IN_VARIABLES.map((variable) => (
            <button
              key={variable.token}
              type="button"
              className="chip"
              title={variable.label}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => insert(variable.token)}
            >
              {variable.token}
            </button>
          ))}
          {answerFields.map((entry) => (
            <button
              key={entry.key}
              type="button"
              className="chip"
              title={entry.label}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => insert(`{{${entry.key}}}`)}
            >
              {`{{${entry.key}}}`}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

type SeenOption = { value: string; label: string };

/**
 * A text answer to compare against: one the form has already sent, picked
 * from a list, or typed (for an answer nobody has sent yet).
 */
function SeenValuePicker({
  options,
  value,
  onChange,
}: {
  options: SeenOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  const [typing, setTyping] = useState(!!value && !options.some((option) => option.value === value));
  return (
    <>
      <select
        id="c-val"
        value={typing ? TYPED : value}
        onChange={(event) => {
          const next = event.target.value;
          setTyping(next === TYPED);
          onChange(next === TYPED ? "" : next);
        }}
      >
        <option value="">Choose an answer</option>
        <optgroup label="Answers on the form">
          {options.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </optgroup>
        <option value={TYPED}>Type another value…</option>
      </select>
      {typing && (
        <input aria-label="Value" value={value} autoFocus onChange={(event) => onChange(event.target.value)} />
      )}
      {typing && <span className="hint">Exactly as the form sends it.</span>}
    </>
  );
}

/** "Is one of": tick answers the form has sent, and (for free text) add others it hasn't yet. */
function AnyOfSeen({
  options,
  operands,
  onOperands,
  allowOthers,
}: {
  options: SeenOption[];
  operands: string[];
  onOperands: (value: string[]) => void;
  allowOthers: boolean;
}) {
  const known = new Set(options.map((option) => option.value));
  const ticked = operands.filter((value) => known.has(value));
  const [others, setOthers] = useState(operands.filter((value) => value && !known.has(value)).join(", "));
  const otherValues = (text: string) =>
    text
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
  return (
    <div className="field">
      <span className="field-label">Any of</span>
      {options.map((option) => (
        <label className="check" key={option.value}>
          <input
            type="checkbox"
            checked={ticked.includes(option.value)}
            onChange={(event) =>
              onOperands([
                ...(event.target.checked ? [...ticked, option.value] : ticked.filter((value) => value !== option.value)),
                ...otherValues(others),
              ])
            }
          />
          <span>{option.label}</span>
        </label>
      ))}
      {allowOthers && (
        <>
          <label htmlFor="c-val-others" className="hint">
            Also answers nobody has sent yet, separated by commas
          </label>
          <input
            id="c-val-others"
            value={others}
            onChange={(event) => {
              setOthers(event.target.value);
              onOperands([...ticked, ...otherValues(event.target.value)]);
            }}
          />
        </>
      )}
    </div>
  );
}

function OperandSlot({ index, children }: { index: number; children: React.ReactNode }) {
  return (
    <>
      {index > 0 && <span className="muted">and</span>}
      {children}
    </>
  );
}
