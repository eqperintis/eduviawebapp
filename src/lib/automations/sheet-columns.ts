import type { TriggerField } from "@/lib/automations/triggers";

/**
 * Which value goes in which column of a Google Sheet. Stored on the step as
 * JSON [{ header, value }], where `value` is text with {{tokens}} (usually
 * just one, like "{{revenue}}"), filled in per submission. Free of server
 * imports so the step editor can use the same rules.
 */

export type SheetColumn = { header: string; value: string };

export type ColumnSource = { value: string; label: string; group: string };

/** The one value every submission has whatever the form: when it came in. */
export const SUBMITTED_AT: ColumnSource = { value: "{{submitted_at}}", label: "Submission date & time", group: "" };

/** Everything else is whatever the form has actually sent, learned from its submissions. */
export function columnSources(fields: TriggerField[]): ColumnSource[] {
  const answers = fields
    .filter((field) => !field.key.startsWith("_"))
    .map((field) => ({ value: `{{${field.key}}}`, label: field.label, group: "Form fields" }));
  return [SUBMITTED_AT, ...answers];
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Column names that mean "when it was submitted". */
const SUBMITTED_AT_ALIASES = new Set([
  "submittedat",
  "submitted",
  "submissiondatetime",
  "submissiondate",
  "timestamp",
  "date",
  "datetime",
  "dateandtime",
]);

/** The value a column's header most likely wants: a field with the same name or label, or the submission time. "" if none. */
export function guessColumnValue(header: string, fields: TriggerField[]): string {
  const target = normalize(header);
  if (!target) return "";
  const field = fields.find(
    (entry) => !entry.key.startsWith("_") && (normalize(entry.key) === target || normalize(entry.label) === target),
  );
  if (field) return `{{${field.key}}}`;
  return SUBMITTED_AT_ALIASES.has(target) ? SUBMITTED_AT.value : "";
}

/**
 * The editor's rows once the sheet's real header row is known: every sheet
 * column in sheet order (keeping what was already chosen for it, else a
 * guess), then any saved column the sheet doesn't have yet (it gets added).
 */
export function mergeColumns(sheetHeaders: string[], saved: SheetColumn[], fields: TriggerField[]): SheetColumn[] {
  const savedByHeader = new Map(saved.map((column) => [column.header, column.value]));
  const rows = sheetHeaders
    .filter((header) => header.trim())
    .map((header) => ({ header, value: savedByHeader.get(header) ?? guessColumnValue(header, fields) }));
  const present = new Set(rows.map((row) => row.header));
  return [...rows, ...saved.filter((column) => !present.has(column.header))];
}

/** A blank tab: the submission time, then one column per field the form has sent. */
export function defaultColumns(fields: TriggerField[]): SheetColumn[] {
  return [
    { header: "Submission date & time", value: SUBMITTED_AT.value },
    ...fields
      .filter((field) => !field.key.startsWith("_"))
      .map((field) => ({ header: field.label, value: `{{${field.key}}}` })),
  ];
}

export function parseColumns(raw: string | null | undefined): SheetColumn[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is SheetColumn =>
        !!entry && typeof entry.header === "string" && typeof entry.value === "string",
    );
  } catch {
    return [];
  }
}
