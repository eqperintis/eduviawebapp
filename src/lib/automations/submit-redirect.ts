import { evaluateCondition } from "@/lib/automations/conditions";

/**
 * A Redirect step only means anything while the person is still in their
 * browser, mid-submit. Everything that happens instantly on the way to it is
 * fine (a Condition on their answers, a Send Email, a Webhook) but after a
 * Wait they're long gone. Free of server imports so the
 * builder can show the same rule the engine applies.
 */
export type FlowNode = {
  id: string;
  parentId: string | null;
  branch: string;
  type: string;
  url: string | null;
  conditionField: string | null;
  conditionOperator: string | null;
  conditionValue: string | null;
};

const MAX_DEPTH = 60;

function isAnswerCondition(node: FlowNode): boolean {
  return node.type === "condition" && !!node.conditionField;
}

/** True when a step added under `parentId` would still be reached while the person is submitting. */
export function reachedAtSubmit(nodes: FlowNode[], parentId: string | null): boolean {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  let current = parentId ? byId.get(parentId) : undefined;
  for (let depth = 0; current && depth < MAX_DEPTH; depth += 1) {
    if (current.type === "wait") return false;
    if (current.type === "condition" && !isAnswerCondition(current)) return false;
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return true;
}

/** The Redirect this submission should be sent to, following Condition branches by the answers they gave. */
export function findSubmitRedirect(
  nodes: FlowNode[],
  triggerNodeId: string,
  triggerData: Record<string, unknown>,
): string | null {
  const children = new Map<string, FlowNode[]>();
  for (const node of nodes) {
    if (!node.parentId) continue;
    const list = children.get(node.parentId) ?? [];
    list.push(node);
    children.set(node.parentId, list);
  }

  function visit(node: FlowNode, depth: number): string | null {
    if (depth > MAX_DEPTH) return null;
    if (node.type === "redirect" && node.url) return node.url;
    if (node.type === "wait") return null;

    if (node.type === "condition") {
      if (!isAnswerCondition(node) || !node.conditionOperator) return null;
      const matched = evaluateCondition({
        field: node.conditionField!,
        operator: node.conditionOperator,
        value: node.conditionValue,
        triggerData,
      });
      const next = (children.get(node.id) ?? []).find((child) => child.branch === (matched ? "yes" : "no"));
      return next ? visit(next, depth + 1) : null;
    }

    for (const child of children.get(node.id) ?? []) {
      const url = visit(child, depth + 1);
      if (url) return url;
    }
    return null;
  }

  const trigger = nodes.find((node) => node.id === triggerNodeId);
  return trigger ? visit(trigger, 0) : null;
}
