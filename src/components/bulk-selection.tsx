"use client";

import { createContext, useContext, useState, useTransition, type ReactNode } from "react";
import type { BulkResult } from "@/lib/actions/forms";

/**
 * Act on several rows at once. Wrap a list in <BulkSelection>, put
 * <SelectAll /> in its header and <RowCheck id /> on each row. The tick
 * boxes stay hidden until "Select" is pressed; then the action bar shows,
 * and Cancel hides them again. Cells marked .check-cell only show while
 * selecting, cells marked .row-actions only while not.
 */

export type BulkAction = {
  label: string;
  /** A server action taking the ticked ids. */
  run: (ids: string[]) => Promise<BulkResult>;
  /** Asked before running, with {count} and {noun} filled in. */
  confirm?: string;
  danger?: boolean;
};

type Selection = {
  selecting: boolean;
  ids: string[];
  selected: Set<string>;
  toggle: (id: string) => void;
  setAll: (on: boolean) => void;
};

const SelectionContext = createContext<Selection | null>(null);

function useSelection(): Selection {
  const selection = useContext(SelectionContext);
  if (!selection) throw new Error("Use inside <BulkSelection>");
  return selection;
}

export function BulkSelection({
  ids,
  noun,
  actions,
  intro,
  tools,
  children,
}: {
  ids: string[];
  /** Singular and plural, e.g. ["form", "forms"]. */
  noun: [string, string];
  actions: BulkAction[];
  /** Shown on the left of the Select button's row, e.g. a count. */
  intro?: ReactNode;
  /** Other buttons shown beside Select, e.g. a download. */
  tools?: ReactNode;
  children: ReactNode;
}) {
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<BulkResult | null>(null);
  const [pending, start] = useTransition();
  // Rows can vanish (deleted here or elsewhere): only count what's still listed.
  const selected = new Set(ids.filter((id) => picked.has(id)));
  const count = selected.size;
  const word = count === 1 ? noun[0] : noun[1];

  const selection: Selection = {
    selecting,
    ids,
    selected,
    toggle: (id) =>
      setPicked((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    setAll: (on) => setPicked(on ? new Set(ids) : new Set()),
  };

  function stopSelecting() {
    setSelecting(false);
    setPicked(new Set());
  }

  function run(action: BulkAction) {
    const question = action.confirm?.replaceAll("{count}", String(count)).replaceAll("{noun}", word);
    if (question && !window.confirm(question)) return;
    const chosen = [...selected];
    setMessage(null);
    start(async () => {
      try {
        const result = await action.run(chosen);
        setMessage(result);
        if (!result.error) stopSelecting();
      } catch {
        setMessage({ error: "That didn't work. Refresh and try again." });
      }
    });
  }

  return (
    <SelectionContext.Provider value={selection}>
      <div className="stack-sm bulk" data-selecting={selecting ? "" : undefined}>
        {message && (
          <p className={`notice ${message.error ? "bad" : "ok"}`} role="status">
            {message.error ?? message.ok}
          </p>
        )}
        {selecting ? (
          <div className="bulk-bar" role="toolbar" aria-label={`Actions for selected ${noun[1]}`}>
            <span className="mono">{count === 0 ? `Tick the ${noun[1]} you want` : `${count} ${word} selected`}</span>
            <div className="row">
              {actions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  className={`btn sm ${action.danger ? "danger" : "ghost"}`}
                  disabled={pending || count === 0}
                  onClick={() => run(action)}
                >
                  {action.label}
                </button>
              ))}
              <button type="button" className="btn sm ghost" disabled={pending} onClick={stopSelecting}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="bulk-head">
            <div>{intro}</div>
            <div className="row">
              {tools}
              {ids.length > 0 && (
                <button
                  type="button"
                  className="btn sm ghost"
                  onClick={() => {
                    setMessage(null);
                    setSelecting(true);
                  }}
                >
                  Select
                </button>
              )}
            </div>
          </div>
        )}
        {children}
      </div>
    </SelectionContext.Provider>
  );
}

export function SelectAll({ label = "Select all" }: { label?: string }) {
  const { selecting, ids, selected, setAll } = useSelection();
  if (!selecting) return null;
  const all = ids.length > 0 && selected.size === ids.length;
  return (
    <input
      type="checkbox"
      className="tick"
      aria-label={label}
      checked={all}
      ref={(element) => {
        if (element) element.indeterminate = selected.size > 0 && !all;
      }}
      onChange={() => setAll(!all)}
    />
  );
}

export function RowCheck({ id, label }: { id: string; label: string }) {
  const { selecting, selected, toggle } = useSelection();
  if (!selecting) return null;
  return (
    <input
      type="checkbox"
      className="tick"
      aria-label={label}
      checked={selected.has(id)}
      onChange={() => toggle(id)}
      onClick={(event) => event.stopPropagation()}
    />
  );
}
