import Link from "next/link";
import { db } from "@/lib/db";
import { deleteAutomationsAction, setAutomationsStatusAction } from "@/lib/actions/automations";
import { BulkSelection, RowCheck, SelectAll } from "@/components/bulk-selection";
import { ConfirmButton } from "@/components/confirm-button";
import { DuplicateAutomationButton } from "@/components/duplicate-buttons";
import { NewAutomationButton } from "./new-automation-button";
import { RenameAutomationButton } from "@/components/rename-buttons";

export const metadata = { title: "Automations" };

const STATUS_PILL: Record<string, string> = { active: "ok", paused: "warn", draft: "" };

export default async function AutomationsPage() {
  const [automations, forms] = await Promise.all([
    db.automation.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        triggers: { include: { form: { select: { name: true } } } },
        _count: { select: { runs: true, nodes: true } },
      },
    }),
    db.form.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="stack">
      <div className="page-head">
        <p className="label">Automations</p>
        <div className="spread">
          <h1>What happens after someone submits</h1>
          {forms.length > 0 && <NewAutomationButton forms={forms} />}
        </div>
        <p className="muted">
          Branch on their answers, send them to the right page, email them, alert your team, wait, and pass the data to
          other apps.
        </p>
      </div>

      {forms.length === 0 ? (
        <div className="card empty">
          <p>Create a form first. Automations start when one is submitted.</p>
          <Link className="btn" href="/forms">Go to forms</Link>
        </div>
      ) : automations.length === 0 ? (
        <div className="card empty">
          <p>No automations yet.</p>
          <NewAutomationButton forms={forms} />
        </div>
      ) : null}

      {automations.length > 0 && (
        <BulkSelection
          ids={automations.map((automation) => automation.id)}
          noun={["automation", "automations"]}
          actions={[
            { label: "Turn on", run: setAutomationsStatusAction.bind(null, "active") },
            { label: "Pause", run: setAutomationsStatusAction.bind(null, "paused") },
            {
              label: "Delete",
              run: deleteAutomationsAction,
              danger: true,
              confirm: "Delete {count} {noun} and their run history? This can't be undone.",
            },
          ]}
        >
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th className="check-cell">
                    <SelectAll label="Select all automations" />
                  </th>
                  <th>Automation</th>
                  <th>Starts from</th>
                  <th>Status</th>
                  <th>Steps</th>
                  <th>Runs</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {automations.map((automation) => (
                  <tr key={automation.id}>
                    <td className="check-cell">
                      <RowCheck id={automation.id} label={`Select ${automation.name}`} />
                    </td>
                    <td>
                      <Link href={`/automations/${automation.id}`}>{automation.name}</Link>
                    </td>
                    <td className="muted">{automation.triggers.map((trigger) => trigger.form.name).join(", ") || "—"}</td>
                    <td>
                      <span className={`pill ${STATUS_PILL[automation.status] ?? ""}`}>{automation.status}</span>
                    </td>
                    <td className="mono">{Math.max(0, automation._count.nodes - 1)}</td>
                    <td className="mono">{automation._count.runs}</td>
                    <td className="row-actions">
                      <div className="row-buttons">
                      <RenameAutomationButton automation={automation} />
                      <DuplicateAutomationButton automation={automation} />
                      <ConfirmButton
                        action={deleteAutomationsAction.bind(null, [automation.id])}
                        label="Delete"
                        confirm={`Delete “${automation.name}” and its run history? This can't be undone.`}
                      />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </BulkSelection>
      )}
    </div>
  );
}
