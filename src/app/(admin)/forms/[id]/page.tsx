import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { appUrl, SITE_URL } from "@/lib/brand";
import { displayValue, labelFromKey, parseFields } from "@/lib/forms/fields";
import { buildAiPrompt } from "@/lib/forms/ai-prompt";
import { parseDomainList } from "@/lib/forms/origin";
import { deleteSubmissionAction, deleteSubmissionsAction, updateFormSettingsAction } from "@/lib/actions/forms";
import { BulkSelection, RowCheck, SelectAll } from "@/components/bulk-selection";
import { formatKL, utcToKLWallClock } from "@/lib/tz";
import { CopyButton } from "@/components/copy-button";
import { AiPromptCard } from "@/components/ai-prompt-card";
import { ConfirmButton } from "@/components/confirm-button";
import { SubmissionsChart, type DayCount } from "@/components/submissions-chart";
import { NewAutomationButton } from "../../automations/new-automation-button";
import { SettingsForm } from "./settings-form";
import { DuplicateFormButton } from "@/components/duplicate-buttons";
import { RenameFormButton } from "@/components/rename-buttons";
import { TrackingLinkMaker } from "@/components/tracking-link-maker";

// Formspree's layout: a form is just an endpoint, with nothing to set up.
const TABS = [
  { id: "overview", label: "Overview" },
  { id: "integration", label: "Integration" },
  { id: "submissions", label: "Submissions" },
  { id: "workflow", label: "Workflow" },
  { id: "settings", label: "Settings" },
] as const;

type Tab = (typeof TABS)[number]["id"];

const PAGE_SIZE = 50;
const DAYS = 30;

const dayLabel = new Intl.DateTimeFormat("en-MY", { day: "numeric", month: "short", timeZone: "UTC" });

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const form = await db.form.findUnique({ where: { id }, select: { name: true } });
  return { title: form?.name ?? "Form" };
}

export default async function FormPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; page?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const form = await db.form.findUnique({
    where: { id },
    include: {
      _count: { select: { submissions: true } },
      triggers: { include: { automation: { select: { id: true, name: true, status: true } } } },
    },
  });
  if (!form) notFound();

  const tab: Tab = (TABS.find((entry) => entry.id === query.tab)?.id ?? "overview") as Tab;
  const endpoint = `${appUrl()}/f/${form.publicId}`;
  const utmTag = `<script src="${appUrl()}/utm.js" defer></script>`;
  const fields = parseFields(form.fields);

  return (
    <div className="stack">
      <div className="page-head">
        <p className="label">
          <Link href="/forms">Forms</Link>
        </p>
        <div className="spread">
          <h1>{form.name}</h1>
          <div className="row">
            <span className={`pill ${form.status === "active" ? "ok" : "warn"}`}>
              {form.status === "active" ? "Taking submissions" : "Paused"}
            </span>
            <RenameFormButton form={{ id: form.id, name: form.name }} />
            <DuplicateFormButton form={{ id: form.id, name: form.name }} automationCount={form.triggers.length} />
          </div>
        </div>
      </div>

      <nav className="tabs" aria-label="Form sections">
        {TABS.map((entry) => (
          <Link key={entry.id} href={`/forms/${form.id}?tab=${entry.id}`} aria-current={entry.id === tab ? "page" : undefined}>
            {entry.label}
          </Link>
        ))}
      </nav>

      {tab === "overview" && <Overview formId={form.id} />}

      {tab === "integration" && (
        <div className="stack" style={{ maxWidth: 900 }}>
          <div className="card stack">
            <p className="label">Form endpoint</p>
            <div className="endpoint">
              <code>{endpoint}</code>
              <CopyButton text={endpoint} label="Copy" />
            </div>
            <p className="muted">
              Place this URL in the form&apos;s <code>action</code> attribute, set the method to <code>POST</code>, and
              add a <code>name</code> attribute to each input.
            </p>
          </div>
          <div className="card stack">
            <div className="stack-sm">
              <p className="label">Where people came from</p>
              <p className="muted">
                Add this once to the page with your form. Every enquiry then shows where the person came from, like
                Google search, Instagram or Direct, with nothing else to set up.
              </p>
            </div>
            <div className="endpoint">
              <code>{utmTag}</code>
              <CopyButton text={utmTag} label="Copy" />
            </div>
            <p className="muted">
              It shows on each submission and in the CSV as &ldquo;Came from&rdquo;, and you can use it in conditions,
              Google Sheets and emails as <code>{"{{came_from}}"}</code>. Forms sent with JavaScript and no{" "}
              <code>action</code> need a <code>data-utm</code> attribute on the <code>&lt;form&gt;</code>.
            </p>
          </div>
          <div className="card stack">
            <div className="stack-sm">
              <p className="label">Make a tracking link</p>
              <p className="muted">
                For more detail, like which campaign or which ad, share a link made here instead of your plain page
                address. The labels on it (UTM tags) arrive with the enquiry, kept for 30 days if the person looks
                around first.
              </p>
            </div>
            <TrackingLinkMaker page={form.pageUrl || `${SITE_URL}/`} />
          </div>
          <AiPromptCard
            prompt={buildAiPrompt({ endpoint, formName: form.name, fields, allowedDomains: parseDomainList(form.allowedDomains) })}
          />
        </div>
      )}

      {tab === "submissions" && (
        <Submissions formId={form.id} total={form._count.submissions} page={Number(query.page) || 1} labels={fields} />
      )}

      {tab === "workflow" && (
        <div className="stack" style={{ maxWidth: 900 }}>
          <div className="card stack">
            <div className="spread">
              <div className="stack-sm">
                <h2>Automations on this form</h2>
                <p className="muted">What happens after someone submits: conditions, redirects, emails, waits and webhooks.</p>
              </div>
              <NewAutomationButton forms={[{ id: form.id, name: form.name }]} lockedFormId={form.id} />
            </div>
            {form.triggers.length === 0 ? (
              <p className="muted">None yet.</p>
            ) : (
              <ul className="recent">
                {form.triggers.map((trigger) => (
                  <li key={trigger.id}>
                    <Link href={`/automations/${trigger.automation.id}`}>{trigger.automation.name}</Link>
                    <span className={`pill ${trigger.automation.status === "active" ? "ok" : "warn"}`}>{trigger.automation.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {tab === "settings" && (
        <SettingsForm
          key={form.name}
          formId={form.id}
          initial={{
            name: form.name,
            status: form.status,
            notifyEnabled: form.notifyEnabled,
            notifyEmails: form.notifyEmails ?? "",
            allowedDomains: form.allowedDomains ?? "",
            redirectUrl: form.redirectUrl,
            pageUrl: form.pageUrl ?? "",
            pageReadAt: form.pageScannedAt ? formatKL(form.pageScannedAt) : "",
            successTitle: form.successTitle,
            successMessage: form.successMessage ?? "",
          }}
          action={updateFormSettingsAction.bind(null, form.id)}
        />
      )}
    </div>
  );
}

/** Formspree's overview: the 30-day count, a chart per day, and the latest few. */
async function Overview({ formId }: { formId: string }) {
  const today = utcToKLWallClock(new Date()).date;
  const start = new Date(`${today}T00:00:00+08:00`);
  start.setUTCDate(start.getUTCDate() - (DAYS - 1));

  const [recent, latest] = await Promise.all([
    db.formSubmission.findMany({ where: { formId, createdAt: { gte: start } }, select: { createdAt: true } }),
    db.formSubmission.findMany({
      where: { formId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, name: true, email: true, createdAt: true },
    }),
  ]);

  const counts = new Map<string, number>();
  for (const { createdAt } of recent) {
    const date = utcToKLWallClock(createdAt).date;
    counts.set(date, (counts.get(date) ?? 0) + 1);
  }
  const days: DayCount[] = Array.from({ length: DAYS }, (_, index) => {
    const day = new Date(`${today}T00:00:00Z`);
    day.setUTCDate(day.getUTCDate() - (DAYS - 1 - index));
    const date = day.toISOString().slice(0, 10);
    return { date, label: dayLabel.format(day), count: counts.get(date) ?? 0 };
  });

  return (
    <div className="stack">
      <div className="card stack-sm">
        <p className="stat-number">{recent.length}</p>
        <p className="muted">Submissions (last 30 days)</p>
      </div>
      <div className="card stack">
        <p className="label">Submissions per day</p>
        <SubmissionsChart days={days} />
      </div>
      <div className="card stack-sm">
        <div className="spread">
          <p className="label">Latest</p>
          <Link className="btn ghost sm" href={`/forms/${formId}?tab=submissions`}>All submissions</Link>
        </div>
        {latest.length === 0 ? (
          <p className="muted">
            Nothing yet. Point a form at the endpoint under <Link href={`/forms/${formId}?tab=integration`}>Integration</Link>.
          </p>
        ) : (
          <ul className="recent">
            {latest.map((submission) => (
              <li key={submission.id}>
                <span>
                  <strong>{submission.name || submission.email || "Someone"}</strong>
                  {submission.name && submission.email && <span className="muted"> · {submission.email}</span>}
                </span>
                <span className="faint mono">{formatKL(submission.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

async function Submissions({
  formId,
  total,
  page,
  labels,
}: {
  formId: string;
  total: number;
  page: number;
  labels: { key: string; label: string }[];
}) {
  const submissions = await db.formSubmission.findMany({
    where: { formId },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });
  const labelFor = new Map(labels.map((field) => [field.key, field.label]));
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (total === 0) {
    return (
      <div className="card empty">
        <p>No submissions yet.</p>
        <Link className="btn" href={`/forms/${formId}?tab=integration`}>Get the endpoint</Link>
      </div>
    );
  }

  return (
    <div className="stack">
      <BulkSelection
        ids={submissions.map((submission) => submission.id)}
        noun={["submission", "submissions"]}
        intro={
          <p className="muted">
            {total} submission{total === 1 ? "" : "s"}, newest first.
          </p>
        }
        tools={<a className="btn ghost sm" href={`/forms/${formId}/export`}>Download CSV</a>}
        actions={[
          {
            label: "Delete",
            run: deleteSubmissionsAction.bind(null, formId),
            danger: true,
            confirm: "Delete {count} {noun}? This can't be undone.",
          },
        ]}
      >
        <label className="row select-all-row">
          <SelectAll label="Select every submission on this page" />
          <span className="muted">Select all on this page</span>
        </label>
        {submissions.map((submission) => {
          const data = JSON.parse(submission.data) as Record<string, unknown>;
          return (
            <div key={submission.id} className="select-row">
              <RowCheck id={submission.id} label={`Select ${submission.name || submission.email || "submission"}`} />
            <details className="card">
              <summary className="spread" style={{ cursor: "pointer" }}>
                <span className="row">
                  <strong>{submission.name || submission.email || "Someone"}</strong>
                  {submission.email && submission.name && <span className="muted">{submission.email}</span>}
                </span>
                <span className="faint mono">{formatKL(submission.createdAt)}</span>
              </summary>
              <div className="stack" style={{ marginTop: 14 }}>
                <dl className="kv">
                  {Object.entries(data).map(([key, value]) => (
                    <div key={key} style={{ display: "contents" }}>
                      <dt>{labelFor.get(key) ?? labelFromKey(key)}</dt>
                      <dd>{displayValue(value) || "—"}</dd>
                    </div>
                  ))}
                </dl>
                <div className="spread">
                  <span className="faint" style={{ fontSize: "0.8rem" }}>
                    {submission.referrer ? `From ${submission.referrer}` : "No referring page"}
                    {submission.emailOptOutAt ? " · unsubscribed" : ""}
                  </span>
                  <ConfirmButton
                    action={deleteSubmissionAction.bind(null, submission.id)}
                    label="Delete"
                    confirm="Delete this submission? This can't be undone."
                  />
                </div>
              </div>
            </details>
            </div>
          );
        })}
      </BulkSelection>
      {pages > 1 && (
        <div className="row">
          {page > 1 && <Link className="btn ghost sm" href={`/forms/${formId}?tab=submissions&page=${page - 1}`}>Newer</Link>}
          <span className="muted">Page {page} of {pages}</span>
          {page < pages && <Link className="btn ghost sm" href={`/forms/${formId}?tab=submissions&page=${page + 1}`}>Older</Link>}
        </div>
      )}
    </div>
  );
}
