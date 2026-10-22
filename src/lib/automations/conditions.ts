import { utcToKLWallClock } from "@/lib/tz";
import type { FieldKind } from "@/lib/forms/fields";
import type { TriggerField } from "@/lib/automations/triggers";

/**
 * Condition operators, and how a Condition node decides which branch a run
 * takes. Kept free of server-only imports so the builder UI can render the
 * same operator list the engine evaluates against — one source of truth for
 * what "is one of" or "between" means.
 */

export type OperatorDefinition = {
  value: string;
  label: string;
  /** How many operands the founder types: none, one, or a pair (between). */
  operands: 0 | 1 | 2;
  /** Renders the operand as a picker of the field's own options. */
  fromOptions?: boolean;
  /** Allows picking several options at once ("is one of"). */
  multiSelect?: boolean;
  /** Operand is a time of day, "HH:MM". */
  timeOperand?: boolean;
  /** Operand is a calendar date, "YYYY-MM-DD". */
  dateOperand?: boolean;
};

const TEXT_OPERATORS: OperatorDefinition[] = [
  { value: "is", label: "is", operands: 1 },
  { value: "is_not", label: "is not", operands: 1 },
  { value: "contains", label: "contains", operands: 1 },
  { value: "not_contains", label: "does not contain", operands: 1 },
  { value: "starts_with", label: "starts with", operands: 1 },
  { value: "is_one_of", label: "is one of", operands: 1, multiSelect: true },
  { value: "is_empty", label: "is empty", operands: 0 },
  { value: "is_not_empty", label: "is not empty", operands: 0 },
];

const NUMBER_OPERATORS: OperatorDefinition[] = [
  { value: "is", label: "is", operands: 1 },
  { value: "is_not", label: "is not", operands: 1 },
  { value: "lt", label: "is less than", operands: 1 },
  { value: "lte", label: "is at most", operands: 1 },
  { value: "gt", label: "is more than", operands: 1 },
  { value: "gte", label: "is at least", operands: 1 },
  { value: "between", label: "is between", operands: 2 },
];

const CHOICE_OPERATORS: OperatorDefinition[] = [
  { value: "is", label: "is", operands: 1, fromOptions: true },
  { value: "is_not", label: "is not", operands: 1, fromOptions: true },
  { value: "is_one_of", label: "is one of", operands: 1, fromOptions: true, multiSelect: true },
];

const DATETIME_OPERATORS: OperatorDefinition[] = [
  { value: "date_before", label: "is before", operands: 1, dateOperand: true },
  { value: "date_after", label: "is after", operands: 1, dateOperand: true },
  { value: "date_between", label: "is between", operands: 2, dateOperand: true },
  { value: "time_before", label: "is earlier in the day than", operands: 1, timeOperand: true },
  { value: "time_after", label: "is later in the day than", operands: 1, timeOperand: true },
  { value: "is_weekend", label: "falls on a weekend", operands: 0 },
  { value: "is_weekday", label: "falls on a weekday", operands: 0 },
];

export function operatorsForKind(kind: FieldKind, hasOptions: boolean): OperatorDefinition[] {
  if (kind === "number") {
    // A numeric field that also declares options (like Year 1-6) is still
    // worth comparing with < and >, so offer both sets.
    return hasOptions
      ? [...CHOICE_OPERATORS.map((op) => ({ ...op, fromOptions: true })), ...NUMBER_OPERATORS]
      : NUMBER_OPERATORS;
  }
  if (kind === "choice") return CHOICE_OPERATORS;
  if (kind === "datetime") return DATETIME_OPERATORS;
  return TEXT_OPERATORS;
}

export function operatorsForField(field: TriggerField): OperatorDefinition[] {
  return operatorsForKind(field.kind, Boolean(field.options?.length));
}

export function findOperator(
  field: TriggerField | undefined,
  operatorValue: string,
): OperatorDefinition | undefined {
  return field ? operatorsForField(field).find((op) => op.value === operatorValue) : undefined;
}

function parseValue(raw: string | null): unknown {
  if (raw === null || raw === "") return null;
  try {
    return JSON.parse(raw);
  } catch {
    // Tolerate a bare string that was stored before it was JSON-encoded.
    return raw;
  }
}

function asStrings(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((entry) => String(entry));
  if (value === null || value === undefined) return [];
  return [String(value)];
}

function asNumber(value: unknown): number | null {
  const parsed = Number(Array.isArray(value) ? value[0] : value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Evaluates one Condition node against a run's snapshotted trigger data.
 *
 * Multi-value fields (checkboxes) match on "any": "is Ads" is true when Ads
 * is one of the boxes ticked, which is what the owner means by it. Anything unrecognized returns false so a
 * half-configured condition sends people down the No branch rather than
 * silently behaving like "always".
 */
export function evaluateCondition(args: {
  field: string;
  operator: string;
  value: string | null;
  triggerData: Record<string, unknown>;
}): boolean {
  const { field, operator, value, triggerData } = args;

  const actual = triggerData[field];
  const operand = parseValue(value);

  switch (operator) {
    case "is_empty":
      return asStrings(actual).filter((entry) => entry.trim() !== "").length === 0;
    case "is_not_empty":
      return asStrings(actual).filter((entry) => entry.trim() !== "").length > 0;
    default:
      break;
  }

  // Numeric comparisons — only meaningful for single-valued numeric fields.
  const numericOperators = new Set(["lt", "lte", "gt", "gte", "between"]);
  if (numericOperators.has(operator)) {
    const actualNumber = asNumber(actual);
    if (actualNumber === null) return false;
    if (operator === "between") {
      const bounds = asStrings(operand).map((entry) => Number(entry));
      if (bounds.length < 2 || bounds.some((bound) => !Number.isFinite(bound))) return false;
      const [low, high] = bounds[0] <= bounds[1] ? bounds : [bounds[1], bounds[0]];
      return actualNumber >= low && actualNumber <= high;
    }
    const operandNumber = asNumber(operand);
    if (operandNumber === null) return false;
    if (operator === "lt") return actualNumber < operandNumber;
    if (operator === "lte") return actualNumber <= operandNumber;
    if (operator === "gt") return actualNumber > operandNumber;
    return actualNumber >= operandNumber;
  }

  // Date/time comparisons, always read as Kuala Lumpur wall-clock so "before
  // 14 September" and "later than 5pm" mean what the founder sees in the app.
  const dateOperators = new Set([
    "date_before",
    "date_after",
    "date_between",
    "time_before",
    "time_after",
    "is_weekend",
    "is_weekday",
  ]);
  if (dateOperators.has(operator)) {
    const raw = Array.isArray(actual) ? actual[0] : actual;
    if (typeof raw !== "string" && !(raw instanceof Date)) return false;
    const asDate = raw instanceof Date ? raw : new Date(raw);
    if (Number.isNaN(asDate.getTime())) return false;
    const wall = utcToKLWallClock(asDate);

    if (operator === "is_weekend" || operator === "is_weekday") {
      const weekday = new Date(`${wall.date}T00:00:00Z`).getUTCDay();
      const isWeekend = weekday === 0 || weekday === 6;
      return operator === "is_weekend" ? isWeekend : !isWeekend;
    }
    if (operator === "time_before" || operator === "time_after") {
      const operandTime = asStrings(operand)[0];
      if (!operandTime) return false;
      return operator === "time_before" ? wall.time < operandTime : wall.time > operandTime;
    }
    if (operator === "date_between") {
      const bounds = asStrings(operand);
      if (bounds.length < 2) return false;
      const [low, high] = bounds[0] <= bounds[1] ? bounds : [bounds[1], bounds[0]];
      return wall.date >= low && wall.date <= high;
    }
    const operandDate = asStrings(operand)[0];
    if (!operandDate) return false;
    return operator === "date_before" ? wall.date < operandDate : wall.date > operandDate;
  }

  // Everything else is string matching, case-insensitive, "any" across a
  // multi-value field.
  const actualValues = asStrings(actual).map((entry) => entry.toLowerCase());
  const operandValues = asStrings(operand).map((entry) => entry.toLowerCase());

  switch (operator) {
    case "is":
      return actualValues.some((entry) => entry === operandValues[0]);
    case "is_not":
      return actualValues.length > 0 && !actualValues.some((entry) => entry === operandValues[0]);
    case "is_one_of":
      return actualValues.some((entry) => operandValues.includes(entry));
    case "contains":
      return actualValues.some((entry) => operandValues[0] !== undefined && entry.includes(operandValues[0]));
    case "not_contains":
      return !actualValues.some((entry) => operandValues[0] !== undefined && entry.includes(operandValues[0]));
    case "starts_with":
      return actualValues.some(
        (entry) => operandValues[0] !== undefined && entry.startsWith(operandValues[0]),
      );
    default:
      return false;
  }
}
