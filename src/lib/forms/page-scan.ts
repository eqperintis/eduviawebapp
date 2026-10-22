import { parseHTML } from "linkedom";
import { labelFromKey, type FieldDef, type FieldKind } from "@/lib/forms/fields";

/**
 * Reads a form's questions straight from the page it lives on: every
 * dropdown, radio group, checkbox group and pick-list, with all of its
 * options in page order. Submissions only ever show the answers people
 * picked; the page shows the ones they could pick, so a condition can offer
 * "Above RM300K" before anyone has chosen it. Pure (no fetching) so it can
 * be tested.
 */

export type ScannedField = {
  /** The input's name attribute. */
  name: string;
  /** The question as the visitor sees it. */
  label: string;
  kind: FieldKind;
  /** Every option the page offers, in page order. Empty for free text. */
  options: string[];
  multi?: boolean;
};

const SKIPPED_TYPES = new Set(["hidden", "submit", "button", "reset", "image", "password", "file"]);
const MAX_OPTIONS = 60;
const MAX_OPTION_LENGTH = 120;

function clean(text: string | undefined | null): string {
  return (text ?? "")
    .replace(/\s+/g, " ")
    .replace(/\s*[*:]\s*$/, "")
    .trim();
}

type Root = Document;

function all(scope: ParentNode, selector: string): Element[] {
  return [...scope.querySelectorAll(selector)];
}

function byId(root: Root, id: string): Element | null {
  return root.getElementById(id);
}

function labelFor(root: Root, id: string): Element | null {
  return all(root, "label").find((entry) => entry.getAttribute("for") === id) ?? null;
}

function labelText(label: Element): string {
  // A label wrapping its input: its own words, not the select's options.
  const copy = label.cloneNode(true) as Element;
  for (const nested of all(copy, "select, option, textarea, input, ul, ol, datalist")) nested.remove();
  return clean(copy.textContent);
}

function questionFor(root: Root, control: Element, name: string, group: boolean): string {
  const ariaLabel = clean(control.getAttribute("aria-label"));
  const labelledBy = control.getAttribute("aria-labelledby");
  if (labelledBy) {
    const text = clean(labelledBy.split(/\s+/).map((id) => byId(root, id)?.textContent ?? "").join(" "));
    if (text) return text;
  }
  if (group) {
    // Radios and checkboxes: each has its own label (the option); the question is the group's.
    const legend = clean(control.closest("fieldset")?.querySelector("legend")?.textContent);
    if (legend) return legend;
    const groupLabel = clean(control.closest('[role="group"], [role="radiogroup"]')?.getAttribute("aria-label"));
    if (groupLabel) return groupLabel;
    return labelFromKey(name);
  }
  const id = control.getAttribute("id");
  if (id) {
    const label = labelFor(root, id);
    if (label) {
      const text = labelText(label);
      if (text) return text;
    }
  }
  const wrapping = control.closest("label");
  if (wrapping) {
    const text = labelText(wrapping);
    if (text) return text;
  }
  return ariaLabel || labelFromKey(name);
}

function optionLabelFor(root: Root, control: Element): string {
  const id = control.getAttribute("id");
  const label = (id && labelFor(root, id)) || control.closest("label");
  return label ? labelText(label) : "";
}

function uniqueOptions(values: string[]): string[] {
  const seen: string[] = [];
  for (const raw of values) {
    const value = raw.trim();
    if (!value || value.length > MAX_OPTION_LENGTH || seen.includes(value)) continue;
    seen.push(value);
    if (seen.length >= MAX_OPTIONS) break;
  }
  return seen;
}

/** The <form> elements on the page that send to this endpoint, or null if none clearly do. */
function pickForms(root: Root, html: string, publicId: string, strict: boolean): Element[] | null {
  const forms = all(root, "form");
  if (forms.length === 0) return null;
  const endpoint = `/f/${publicId}`;
  const posting = forms.filter((form) => (form.getAttribute("action") ?? "").includes(endpoint));
  if (posting.length) return posting;
  // Sent with fetch() from a script: the page mentions the endpoint, the form has no action.
  if (strict && !html.includes(endpoint)) return null;
  if (forms.length === 1) return forms;
  const named = (form: Element) => form.querySelectorAll("input[name], select[name], textarea[name]").length;
  return [forms.reduce((best, form) => (named(form) > named(best) ? form : best))];
}

/**
 * The questions of the form that posts to /f/<publicId>. With `strict`, the
 * page must mention that endpoint (the address came from a visitor's
 * browser, so it may be a page with some other form on it). Null when the
 * form isn't on the page.
 */
export function scanFormHtml(html: string, publicId: string, strict: boolean): ScannedField[] | null {
  const page = /<html[\s>]/i.test(html) ? html : `<!doctype html><html><body>${html}</body></html>`;
  const root = parseHTML(page).document as unknown as Root;
  const forms = pickForms(root, html, publicId, strict);
  if (!forms) return null;

  const fields = new Map<string, ScannedField>();
  for (const form of forms) {
    for (const control of all(form, "input, select, textarea")) {
      const name = control.getAttribute("name")?.trim();
      if (!name || name.startsWith("_") || name.length > 64) continue;
      const tag = control.tagName.toLowerCase();
      const type = (control.getAttribute("type") ?? "text").toLowerCase();
      if (tag === "input" && SKIPPED_TYPES.has(type)) continue;

      const isGroup = tag === "input" && (type === "radio" || type === "checkbox");
      let field = fields.get(name);
      if (!field) {
        field = { name, label: questionFor(root, control, name, isGroup), kind: "text", options: [] };
        fields.set(name, field);
      }

      if (tag === "select") {
        field.kind = "choice";
        field.multi = control.hasAttribute("multiple") || undefined;
        field.options = uniqueOptions([
          ...field.options,
          ...all(control, "option").map((option) => option.getAttribute("value") ?? option.textContent ?? ""),
        ]);
      } else if (isGroup) {
        const value = control.getAttribute("value");
        // A lone checkbox with no value is a yes/no tick, not a list of choices.
        if (value === null || (type === "checkbox" && value === "on")) continue;
        field.kind = "choice";
        if (type === "checkbox") field.multi = true;
        field.options = uniqueOptions([...field.options, value || optionLabelFor(root, control)]);
      } else {
        // Free text that suggests answers: a <datalist>, or a combobox's own option list.
        const listId = control.getAttribute("list") || control.getAttribute("aria-controls");
        const list = listId ? byId(root, listId) : null;
        if (list) {
          const suggestions =
            list.tagName.toLowerCase() === "datalist"
              ? all(list, "option").map((option) => option.getAttribute("value") ?? option.textContent ?? "")
              : all(list, '[role="option"]').map((option) => option.getAttribute("data-value") ?? option.textContent ?? "");
          field.options = uniqueOptions([...field.options, ...suggestions]);
        }
      }
    }
  }
  return [...fields.values()];
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Folds what the page says into the fields learned from submissions. A
 * field matches by name or by its question (a site may rename "revenue" to
 * "Monthly revenue" before sending). Matching fields get the page's options
 * first, in page order, then any answer seen that the page doesn't list.
 * A question the form hasn't sent yet is added when it has options (that's
 * what conditions need), or when nothing has been learned at all. Returns
 * null when nothing changed.
 */
export function mergeScannedFields(existing: FieldDef[], scanned: ScannedField[]): FieldDef[] | null {
  const fields: FieldDef[] = existing.map((field) => (field.options ? { ...field, options: [...field.options] } : { ...field }));
  const learnedNothing = existing.length === 0;

  for (const entry of scanned) {
    const names = new Set([normalize(entry.name), normalize(entry.label)]);
    const matches = fields.filter((field) => names.has(normalize(field.key)) || names.has(normalize(field.label)));
    if (matches.length === 0) {
      if (!learnedNothing && entry.options.length === 0) continue;
      const created: FieldDef = { key: entry.name, label: entry.label || labelFromKey(entry.name), kind: entry.kind };
      if (entry.options.length) created.options = [...entry.options];
      if (entry.multi) created.multi = true;
      fields.push(created);
      continue;
    }
    if (entry.options.length === 0) continue;
    for (const field of matches) {
      field.options = [...entry.options, ...(field.options ?? []).filter((option) => !entry.options.includes(option))];
    }
  }

  return JSON.stringify(fields) === JSON.stringify(existing) ? null : fields;
}
