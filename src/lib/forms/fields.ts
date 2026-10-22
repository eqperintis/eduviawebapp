/**
 * The fields a form is known to send. Like Formspree, a form has no schema
 * to set up: the site decides what it posts, and the list is learned
 * quietly from submissions (names, a guessed kind, a few answers seen) so
 * automation conditions can suggest fields and values. Free of server
 * imports so the builder UI can use it too.
 */

export type FieldKind = "text" | "email" | "phone" | "number" | "choice" | "datetime";

export const FIELD_KINDS: { value: FieldKind; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "number", label: "Number" },
  { value: "choice", label: "Choice (dropdown, radio, checkboxes)" },
  { value: "datetime", label: "Date / time" },
];

export type FieldDef = {
  key: string;
  label: string;
  kind: FieldKind;
  /** Answers seen so far: every choice for "choice", a few examples otherwise. */
  options?: string[];
  /** True when one submission can carry several values (checkboxes). */
  multi?: boolean;
};

/** How many distinct choice values to remember per field. */
const MAX_OPTIONS = 50;

/** Text answers longer than this are free text, not worth suggesting as a value. */
const MAX_SUGGESTED_LENGTH = 60;

/** How many example answers to keep for a field that isn't a choice. */
const MAX_EXAMPLES = 20;

/** Keys longer than this, or with odd characters, are stored but not learned as fields. */
const MAX_KEY_LENGTH = 64;

export function parseFields(raw: string | null | undefined): FieldDef[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is FieldDef =>
        !!entry && typeof entry === "object" && typeof (entry as FieldDef).key === "string",
    );
  } catch {
    return [];
  }
}

/** "first_name" → "First name". */
export function labelFromKey(key: string): string {
  const words = key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_\-.]+/g, " ")
    .trim()
    .toLowerCase();
  return words ? words[0].toUpperCase() + words.slice(1) : key;
}

function guessKind(key: string, value: unknown): FieldKind {
  const lower = key.toLowerCase();
  if (Array.isArray(value)) return "choice";
  if (lower.includes("email") || lower === "_replyto") return "email";
  if (/(phone|whatsapp|mobile|tel)/.test(lower)) return "phone";
  if (/(date|time|_at$)/.test(lower)) return "datetime";
  if (typeof value === "number") return "number";
  return "text";
}

function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((entry) => String(entry));
  if (value === null || value === undefined || value === "") return [];
  return [String(value)];
}

/**
 * Adds any key in `data` the form hasn't seen before, and any new value of
 * a choice field. Returns null when nothing changed, so the caller can skip
 * the write.
 */
export function learnFields(existing: FieldDef[], data: Record<string, unknown>): FieldDef[] | null {
  let changed = false;
  const fields: FieldDef[] = existing.map((field) =>
    field.options ? { ...field, options: [...field.options] } : { ...field },
  );
  const byKey = new Map(fields.map((field) => [field.key, field]));

  for (const [key, value] of Object.entries(data)) {
    if (key.length > MAX_KEY_LENGTH || !/^[\w\-. \[\]]+$/.test(key)) continue;

    let field = byKey.get(key);
    if (!field) {
      const kind = guessKind(key, value);
      const created: FieldDef = { key, label: labelFromKey(key), kind };
      if (kind === "choice") {
        created.options = [];
        created.multi = Array.isArray(value);
      }
      fields.push(created);
      byKey.set(key, created);
      field = created;
      changed = true;
    }

    if (field.kind === "choice") {
      if (Array.isArray(value) && !field.multi) {
        field.multi = true;
        changed = true;
      }
      const options = field.options ?? [];
      for (const entry of asStringList(value)) {
        if (entry.length > 120 || options.includes(entry) || options.length >= MAX_OPTIONS) continue;
        options.push(entry);
        changed = true;
      }
      field.options = options;
    } else if (field.kind === "text" || field.kind === "number") {
      // Short answers repeat (a dropdown on the site, a yes/no): keep a few
      // so a condition can offer them. Emails, phones and dates never do.
      const entry = asStringList(value)[0];
      if (entry && entry.length <= MAX_SUGGESTED_LENGTH && !(field.options ?? []).includes(entry)) {
        const options = field.options ?? [];
        if (options.length < MAX_EXAMPLES) {
          field.options = [...options, entry];
          changed = true;
        }
      }
    }
  }

  return changed ? fields : null;
}

/** Keys that look like the submitter's email, best first. */
const EMAIL_KEYS = ["email", "_replyto", "e-mail", "email_address", "emailAddress"];

const EMAIL_PATTERN = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

export function isEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value) && value.length <= 254;
}

/** The submitter's email: a well-known key first, then any key containing "email". */
export function extractEmail(data: Record<string, unknown>): string {
  const candidates = [
    ...EMAIL_KEYS.map((key) => data[key]),
    ...Object.entries(data)
      .filter(([key]) => key.toLowerCase().includes("email"))
      .map(([, value]) => value),
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && isEmail(candidate.trim())) return candidate.trim();
  }
  return "";
}

/** "First name" / "first-name" / "firstName" → "first_name", for matching. */
function normalizeKey(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[\s\-.]+/g, "_");
}

export function extractName(data: Record<string, unknown>): string {
  const byKey = new Map<string, string>();
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "string" && value.trim()) byKey.set(normalizeKey(key), value.trim());
  }
  for (const key of ["name", "full_name", "your_name", "fullname"]) {
    const value = byKey.get(key);
    if (value) return value.slice(0, 190);
  }
  const first = byKey.get("first_name") ?? byKey.get("fname");
  const last = byKey.get("last_name") ?? byKey.get("lname");
  return [first, last].filter(Boolean).join(" ").slice(0, 190);
}

/** A submission value as one line of text. */
export function displayValue(value: unknown): string {
  if (Array.isArray(value)) return value.map((entry) => String(entry)).join(", ");
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
