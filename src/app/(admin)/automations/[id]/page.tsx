import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { buildTrigger } from "@/lib/automations/triggers";
import { describeNode, type StoredNode } from "@/lib/automations/flow";
import { formatKL } from "@/lib/tz";
import { getGoogleConnectionStatus, googlePickerApiKey, googleProjectNumber } from "@/lib/google/oauth";
import { refreshStalePages } from "@/lib/forms/page-read";
import { Builder } from "./builder";
import { DuplicateAutomationButton } from "@/components/duplicate-buttons";
import { RenameAutomationButton } from "@/components/rename-buttons";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const automation = await db.automation.findUnique({ where: { id }, select: { name: true } });
  return { title: automation?.name ?? "Automation" };
}

const RUN_PILL: Record<string, string> = { active: "accent", completed: "ok", stopped: "warn", failed: "bad" };
const EVENT_PILL: Record<string, string> = { ok: "ok", skipped: "warn", failed: "bad" };

export default async function AutomationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  // Conditions offer every option on the form's page: re-read it first if it's been a while.
  const starts = await db.automationTrigger.findMany({ where: { automationId: id }, select: { formId: true } });
  await refreshStalePages(starts.map((start) => start.formId));
  const automation = await db.automation.findUnique({
    where: { id },
    include: {
      nodes: { orderBy: { createdAt: "asc" } },
      triggers: { orderBy: { createdAt: "asc" }, include: { form: { select: { id: true, publicId: true, name: true, fields: true } } } },
      _count: { select: { runs: true } },
    },
  });
  if (!automation) notFound();

  const forms = await db.form.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, name: true } });
  const trigger = buildTrigger(automation.triggers.map((entry) => entry.form));
  const nodes: StoredNode[] = automation.nodes.map((node) => ({
    id: node.id,
    type: node.type,
    parentId: node.parentId,
    branch: node.branch,
    recipients: node.recipients,
    subject: node.subject,
    content: node.content,
    ctaLabel: node.ctaLabel,
    url: node.url,
    delayMinutes: node.delayMinutes,
    conditionField: node.conditionField,
    conditionOperator: node.conditionOperator,
    conditionValue: node.conditionValue,
  }));
  const showRuns = tab === "runs";

  return (
    <div className="stack">
      <div className="page-head">
        <p className="label">
          <Link href="/automations" style={{ textDecoration: "none" }}>Automations</Link> / {automation.status}
        </p>
        <div className="spread">
          <h1>{automation.name}</h1>
          <div className="row">
            <RenameAutomationButton automation={{ id: automation.id, name: automation.name }} />
            <DuplicateAutomationButton automation={{ id: automation.id, name: automation.name }} />
          </div>
        </div>
      </div>

      <nav className="tabs" aria-label="Automation sections">
        <Link href={`/automations/${automation.id}`} aria-current={showRuns ? undefined : "page"}>Flow</Link>
        <Link href={`/automations/${automation.id}?tab=runs`} aria-current={showRuns ? "page" : undefined}>
          Runs ({automation._count.runs})
        </Link>
      </nav>

      {showRuns ? (
        <Runs automationId={automation.id} nodes={nodes} trigger={trigger} />
      ) : (
        <Builder
          automation={{ id: automation.id, name: automation.name, status: automation.status }}
          nodes={nodes}
          trigger={trigger}
          forms={forms}
          selectedFormIds={automation.triggers.map((entry) => entry.form.id)}
          google={{
            connected: (await getGoogleConnectionStatus()).connected,
            pickerApiKey: googlePickerApiKey(),
            appId: googleProjectNumber(),
          }}
        />
      )}
    </div>
  );
}

async function Runs({
  automationId,
  nodes,
  trigger,
}: {
  automationId: string;
  nodes: StoredNode[];
  trigger: ReturnType<typeof buildTrigger>;
}) {
  const runs = await db.automationRun.findMany({
    where: { automationId },
    orderBy: { startedAt: "desc" },
    take: 50,
    include: { events: { orderBy: { createdAt: "asc" } } },
  });
  const stepTitle = new Map(nodes.map((node) => [node.id, describeNode(node, trigger).title]));

  if (runs.length === 0) {
    return <div className="card empty">No runs yet. One starts each time someone submits a form this automation listens to.</div>;
  }

  return (
    <div className="stack-sm">
      <p className="muted">The latest 50 runs, newest first.</p>
      {runs.map((run) => (
        <details key={run.id} className="card">
          <summary className="spread" style={{ cursor: "pointer" }}>
            <span className="row">
              <strong>{run.name || run.email || "Someone"}</strong>
              {run.email && run.name && <span className="muted">{run.email}</span>}
              <span className={`pill ${RUN_PILL[run.status] ?? ""}`}>{run.status}</span>
            </span>
            <span className="faint mono">{formatKL(run.startedAt)}</span>
          </summary>
          <div className="stack-sm" style={{ marginTop: 12 }}>
            {run.status === "active" && run.nextRunAt && (
              <p className="notice">
                Next: {run.currentNodeId ? stepTitle.get(run.currentNodeId) ?? "next step" : "finish"} at {formatKL(run.nextRunAt)}
              </p>
            )}
            {run.events.length === 0 ? (
              <p className="muted">Nothing has happened yet.</p>
            ) : (
              <ol className="events">
                {run.events.map((event) => (
                  <li key={event.id}>
                    <div className="row">
                      <span className={`pill ${EVENT_PILL[event.status] ?? ""}`}>{event.status}</span>
                      <strong>{event.nodeId ? stepTitle.get(event.nodeId) ?? "Removed step" : ""}</strong>
                      <span className="faint mono" style={{ marginLeft: "auto" }}>{formatKL(event.createdAt)}</span>
                    </div>
                    <p className="muted">{event.message}</p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </details>
      ))}
    </div>
  );
}
