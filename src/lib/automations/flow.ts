import { operatorsForField } from "@/lib/automations/conditions";
import { fieldOrTyped, type TriggerDefinition } from "@/lib/automations/triggers";

/**
 * The automation flow as a tree: one "trigger" root, each step hanging off
 * its parent's "main" output, or a Condition's "yes"/"no". One child per
 * output keeps it a tree the engine can always walk. Free of server
 * imports so the builder can use the same rules.
 */

export type StepType = "trigger" | "condition" | "wait" | "send_email" | "notify" | "redirect" | "webhook" | "google_sheets";

export type StoredNode = {
  id: string;
  type: string;
  parentId: string | null;
  branch: string;
  recipients: string | null;
  subject: string | null;
  content: string | null;
  ctaLabel: string | null;
  url: string | null;
  delayMinutes: number | null;
  conditionField: string | null;
  conditionOperator: string | null;
  conditionValue: string | null;
};

export const STEP_TYPES: { type: Exclude<StepType, "trigger">; label: string; help: string }[] = [
  { type: "send_email", label: "Email them", help: "Send an email to the person who filled in the form." },
  { type: "notify", label: "Email my team", help: "Send an alert to fixed addresses, with their answers." },
  { type: "condition", label: "Condition", help: "Split the flow into Yes and No based on an answer." },
  { type: "wait", label: "Wait", help: "Pause before the next step." },
  { type: "redirect", label: "Redirect", help: "Send them to a page right after they submit." },
  { type: "google_sheets", label: "Google Sheets", help: "Add the submission as a new row in a sheet you pick from Google Drive." },
  { type: "webhook", label: "Webhook", help: "POST the submission to another app, e.g. Zapier or Make." },
];

export function outputsOf(type: string): string[] {
  return type === "condition" ? ["yes", "no"] : ["main"];
}

export function childAt(nodes: StoredNode[], parentId: string, branch: string): StoredNode | undefined {
  return nodes.find((node) => node.parentId === parentId && node.branch === branch);
}

export function formatDelay(minutes: number | null): string {
  if (!minutes) return "No wait set";
  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return `Wait ${days} ${days === 1 ? "day" : "days"}`;
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `Wait ${hours} ${hours === 1 ? "hour" : "hours"}`;
  }
  return `Wait ${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
}

export function parseOperand(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [String(parsed)];
  } catch {
    return [raw];
  }
}

function joinWithOr(values: string[]): string {
  if (values.length <= 1) return values[0] ?? "";
  return `${values.slice(0, -1).join(", ")} or ${values[values.length - 1]}`;
}

/** "If Student's level is Upper secondary", written the way the owner would say it. */
export function describeCondition(node: StoredNode, trigger: TriggerDefinition): string {
  if (!node.conditionField || !node.conditionOperator) return "Not set up yet";
  const field = fieldOrTyped(trigger, node.conditionField);
  const label = field?.label ?? node.conditionField;
  const operator = field ? operatorsForField(field).find((op) => op.value === node.conditionOperator) : undefined;
  const operands = parseOperand(node.conditionValue).map(
    (value) => field?.options?.find((option) => option.value === value)?.label ?? value,
  );
  const opLabel = operator?.label ?? node.conditionOperator;
  if (operator?.operands === 0) return `If ${label} ${opLabel}`;
  if (operator?.operands === 2) return `If ${label} ${opLabel} ${operands[0] ?? "?"} and ${operands[1] ?? "?"}`;
  return `If ${label} ${opLabel} ${joinWithOr(operands) || "?"}`;
}

export function describeNode(node: StoredNode, trigger: TriggerDefinition): { title: string; detail: string } {
  switch (node.type) {
    case "trigger":
      return { title: "When a form is submitted", detail: trigger.description };
    case "send_email":
      return { title: "Email them", detail: node.subject || "Not written yet" };
    case "notify":
      return {
        title: "Email my team",
        detail: node.recipients ? `To ${node.recipients.split(/[\s,]+/).filter(Boolean).join(", ")}` : "No addresses yet",
      };
    case "wait":
      return { title: "Wait", detail: formatDelay(node.delayMinutes) };
    case "redirect":
      return { title: "Redirect", detail: node.url || "No link set" };
    case "webhook":
      return { title: "Webhook", detail: node.url || "No URL set" };
    case "google_sheets":
      return {
        title: "Google Sheets",
        detail: node.url ? `${node.subject || "Spreadsheet"} · ${node.ctaLabel || "Sheet1"}` : "No sheet chosen",
      };
    case "condition":
      return { title: "Condition", detail: describeCondition(node, trigger) };
    default:
      return { title: node.type, detail: "" };
  }
}

/** Variables a step's text can use. Answer keys come from the trigger's fields. */
export const BUILT_IN_VARIABLES: { token: string; label: string }[] = [
  { token: "{{name}}", label: "Their name (or “there”)" },
  { token: "{{email}}", label: "Their email" },
  { token: "{{form_name}}", label: "Form name" },
  { token: "{{submitted_at}}", label: "When they submitted" },
  { token: "{{answers}}", label: "All their answers, as a list" },
];
