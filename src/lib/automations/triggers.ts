import { parseFields, type FieldDef, type FieldKind } from "@/lib/forms/fields";

/**
 * What starts an automation (one or more forms) and which fields its
 * Condition steps can read. Same shape as SEKOOL's trigger registry, but
 * every trigger here is a form, so the field list comes from the form's
 * learned fields. Free of server imports: the builder UI uses it too.
 */

export type TriggerField = {
  key: string;
  label: string;
  kind: FieldKind;
  options?: { value: string; label: string }[];
  multi?: boolean;
  hint?: string;
  /** Worked out by the app rather than typed by the person. */
  computed?: boolean;
  /** With several forms: which form(s) ask this question. */
  group?: string;
};

export type TriggerDefinition = {
  label: string;
  description: string;
  fields: TriggerField[];
};

/** Stamped into every run's data: the public id of the form that started it. */
export const SUBMITTED_FORM_FIELD_KEY = "_form";

export const SHARED_FIELD_GROUP = "On more than one form";

export type TriggerForm = { publicId: string; name: string; fields: string | null };

function toTriggerField(field: FieldDef): TriggerField {
  return {
    key: field.key,
    label: field.label || field.key,
    kind: field.kind,
    options: field.options?.map((value) => ({ value, label: value })),
    multi: field.multi,
  };
}

const BUILT_IN_FIELDS: TriggerField[] = [
  { key: "_email", label: "Their email (found on the form)", kind: "email", computed: true },
  { key: "_name", label: "Their name (found on the form)", kind: "text", computed: true },
  { key: "_submitted_at", label: "When they submitted", kind: "datetime", computed: true },
];

/** Folds the automation's forms into the one definition the builder and engine use. */
export function buildTrigger(forms: TriggerForm[]): TriggerDefinition {
  if (forms.length === 0) {
    return { label: "No form chosen", description: "Choose at least one form to start this automation.", fields: [] };
  }

  const byKey = new Map<string, { field: TriggerField; forms: string[] }>();
  for (const form of forms) {
    for (const field of parseFields(form.fields).map(toTriggerField)) {
      const entry = byKey.get(field.key);
      if (!entry) {
        byKey.set(field.key, { field, forms: [form.name] });
        continue;
      }
      entry.forms.push(form.name);
      if (entry.field.options && field.options) {
        const seen = new Set(entry.field.options.map((option) => option.value));
        entry.field.options = [...entry.field.options, ...field.options.filter((option) => !seen.has(option.value))];
      }
    }
  }

  const several = forms.length > 1;
  const fields: TriggerField[] = [...byKey.values()].map(({ field, forms: askedOn }) => ({
    ...field,
    group: several ? (askedOn.length > 1 ? SHARED_FIELD_GROUP : askedOn[0]) : undefined,
    hint:
      several && askedOn.length < forms.length
        ? `Only sent by: ${askedOn.join(", ")}. Anyone from another form has this blank.`
        : undefined,
  }));

  const names = forms.map((form) => `“${form.name}”`);
  return {
    label: forms.map((form) => form.name).join(" + "),
    description: several
      ? `Starts when someone submits any of: ${names.join(", ")}`
      : `Starts when someone submits ${names[0]}`,
    fields: [
      ...(several
        ? [
            {
              key: SUBMITTED_FORM_FIELD_KEY,
              label: "Which form they submitted",
              kind: "choice" as const,
              options: forms.map((form) => ({ value: form.publicId, label: form.name })),
              computed: true,
            },
          ]
        : []),
      ...fields,
      ...BUILT_IN_FIELDS,
    ],
  };
}

export function getTriggerField(trigger: TriggerDefinition, key: string): TriggerField | undefined {
  return trigger.fields.find((field) => field.key === key);
}

/** Field names a form can send, as a condition may name them. */
export const FIELD_KEY_PATTERN = /^[\w\-. \[\]]{1,64}$/;

/**
 * A condition's field: one the form has sent, or (like Formspree, where
 * nothing is set up in advance) any name the owner types, read as text.
 */
export function fieldOrTyped(trigger: TriggerDefinition, key: string): TriggerField | undefined {
  const known = getTriggerField(trigger, key);
  if (known) return known;
  const typed = key.trim();
  return typed && !typed.startsWith("_") && FIELD_KEY_PATTERN.test(typed)
    ? { key: typed, label: typed, kind: "text" }
    : undefined;
}
