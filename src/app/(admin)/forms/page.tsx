import Link from "next/link";
import { db } from "@/lib/db";
import { formatKL } from "@/lib/tz";
import { deleteFormsAction, setFormsStatusAction } from "@/lib/actions/forms";
import { BulkSelection, RowCheck, SelectAll } from "@/components/bulk-selection";
import { ConfirmButton } from "@/components/confirm-button";
import { NewFormButton } from "./new-form-button";

export const metadata = { title: "Forms" };

export default async function FormsPage() {
  const forms = await db.form.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { submissions: true } },
      submissions: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
    },
  });

  return (
    <div className="stack">
      <div className="page-head">
        <p className="label">Forms</p>
        <div className="spread">
          <h1>Your form endpoints</h1>
          <NewFormButton />
        </div>
        <p className="muted">
          Keep your form&apos;s design on your own site. Point it at an endpoint here and every answer is saved, emailed to
          you and handed to your automations.
        </p>
      </div>

      {forms.length === 0 ? (
        <div className="card empty">
          <p>No forms yet.</p>
          <NewFormButton />
        </div>
      ) : (
        <BulkSelection
          ids={forms.map((form) => form.id)}
          noun={["form", "forms"]}
          actions={[
            { label: "Turn on", run: setFormsStatusAction.bind(null, "active") },
            { label: "Pause", run: setFormsStatusAction.bind(null, "paused") },
            {
              label: "Delete",
              run: deleteFormsAction,
              danger: true,
              confirm: "Delete {count} {noun} and every submission in them? This can't be undone.",
            },
          ]}
        >
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th className="check-cell">
                    <SelectAll label="Select all forms" />
                  </th>
                  <th>Form</th>
                  <th>Endpoint</th>
                  <th>Status</th>
                  <th>Submissions</th>
                  <th>Last one</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {forms.map((form) => (
                  <tr key={form.id}>
                    <td className="check-cell">
                      <RowCheck id={form.id} label={`Select ${form.name}`} />
                    </td>
                    <td>
                      <Link href={`/forms/${form.id}`}>{form.name}</Link>
                    </td>
                    <td className="mono">/f/{form.publicId}</td>
                    <td>
                      <span className={`pill ${form.status === "active" ? "ok" : "warn"}`}>{form.status}</span>
                    </td>
                    <td className="mono">{form._count.submissions}</td>
                    <td className="muted">{form.submissions[0] ? formatKL(form.submissions[0].createdAt) : "—"}</td>
                    <td className="row-actions">
                      <ConfirmButton
                        action={deleteFormsAction.bind(null, [form.id])}
                        label="Delete"
                        confirm={`Delete “${form.name}” and its ${form._count.submissions} submission${form._count.submissions === 1 ? "" : "s"}? This can't be undone.`}
                      />
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
