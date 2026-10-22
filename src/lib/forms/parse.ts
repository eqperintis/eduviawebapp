/**
 * Reads a submission the way Formspree does: whatever the site's own form
 * posts, as a regular HTML form (urlencoded or multipart) or as JSON from
 * fetch(). Keys starting with "_" are instructions, not answers:
 *
 *   _next     where to send the visitor afterwards (plain HTML submits)
 *   _subject  subject line of the notification email
 *   _replyto  the submitter's email, if the form names it something else
 *   _gotcha   honeypot: a hidden field real people leave empty
 *
 * Every other key is stored as an answer. A repeated key (checkboxes) or a
 * "name[]" key becomes a list.
 */

export const MAX_BODY_BYTES = 256 * 1024;
const MAX_FIELDS = 100;
const MAX_VALUE_LENGTH = 10_000;

export type SubmissionMeta = {
  next: string;
  subject: string;
  replyTo: string;
  /** True when the honeypot was filled in, i.e. almost certainly a bot. */
  spam: boolean;
};

export type ParsedSubmission = { data: Record<string, unknown>; meta: SubmissionMeta };

export class SubmissionError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function cleanKey(key: string): string {
  return key.replace(/\[\]$/, "").trim().slice(0, 120);
}

function clip(value: string): string {
  return value.length > MAX_VALUE_LENGTH ? value.slice(0, MAX_VALUE_LENGTH) : value;
}

/** Folds [key, value] pairs into answers + meta. Exported for tests. */
export function collectEntries(entries: [string, unknown][]): ParsedSubmission {
  const data: Record<string, unknown> = {};
  const meta: SubmissionMeta = { next: "", subject: "", replyTo: "", spam: false };
  let count = 0;

  for (const [rawKey, rawValue] of entries) {
    const key = cleanKey(rawKey);
    if (!key) continue;

    const value =
      typeof rawValue === "string"
        ? clip(rawValue)
        : typeof rawValue === "number" || typeof rawValue === "boolean"
          ? rawValue
          : Array.isArray(rawValue)
            ? rawValue.map((entry) => (typeof entry === "string" ? clip(entry) : entry))
            : rawValue === null || rawValue === undefined
              ? ""
              : clip(JSON.stringify(rawValue));

    if (key.startsWith("_")) {
      const text = Array.isArray(value) ? String(value[0] ?? "") : String(value);
      if (key === "_next") meta.next = text.trim();
      else if (key === "_subject") meta.subject = text.trim().slice(0, 200);
      else if (key === "_replyto" || key === "_replyTo") meta.replyTo = text.trim();
      else if (key === "_gotcha" || key === "_honeypot") meta.spam = meta.spam || text.trim() !== "";
      continue;
    }

    const isList = rawKey.endsWith("[]") || Array.isArray(value);
    if (key in data) {
      const current = data[key];
      const list = Array.isArray(current) ? current : [current];
      data[key] = list.concat(value);
      continue;
    }

    count += 1;
    if (count > MAX_FIELDS) throw new SubmissionError("Too many fields.", 413);
    data[key] = isList && !Array.isArray(value) ? [value] : value;
  }

  return { data, meta };
}

export async function parseSubmissionBody(request: Request): Promise<ParsedSubmission> {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > MAX_BODY_BYTES) throw new SubmissionError("Submission is too large.", 413);

  const type = (request.headers.get("content-type") ?? "").toLowerCase();

  if (type.includes("multipart/form-data")) {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new SubmissionError("Couldn't read the form data.", 400);
    }
    // File uploads aren't stored: keep the file name so the owner knows one was attached.
    const entries: [string, unknown][] = [];
    form.forEach((value, key) => {
      entries.push([key, typeof value === "string" ? value : `[file: ${value.name}]`]);
    });
    return collectEntries(entries);
  }

  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new SubmissionError("Submission is too large.", 413);

  if (type.includes("application/json")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text || "{}");
    } catch {
      throw new SubmissionError("The JSON body couldn't be read.", 400);
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new SubmissionError("Send a JSON object of field names to values.", 400);
    }
    return collectEntries(Object.entries(parsed as Record<string, unknown>));
  }

  // application/x-www-form-urlencoded, and anything unlabelled.
  return collectEntries([...new URLSearchParams(text).entries()]);
}

/** True when the client wants JSON back (fetch/AJAX) rather than a page. */
export function wantsJson(request: Request): boolean {
  const accept = (request.headers.get("accept") ?? "").toLowerCase();
  const type = (request.headers.get("content-type") ?? "").toLowerCase();
  if (accept.includes("application/json")) return true;
  if (accept.includes("text/html")) return false;
  return type.includes("application/json");
}
