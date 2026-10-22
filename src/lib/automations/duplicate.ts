import "server-only";
import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

/** A step's own identity and place in the tree: never copied. */
const OWN_KEYS = new Set(["id", "automationId", "parentId", "createdAt", "updatedAt"]);

/**
 * Copies an automation's whole flow under a new name: every step with its
 * settings, in the same tree, started by `formIds`. Runs stay with the
 * original. The copy is a draft, so it never fires before it's been looked
 * over and turned on. Returns the new automation's id.
 */
export async function copyAutomation(tx: Tx, sourceId: string, name: string, formIds: string[]): Promise<string> {
  const nodes = await tx.automationNode.findMany({ where: { automationId: sourceId }, orderBy: { createdAt: "asc" } });
  const copy = await tx.automation.create({ data: { name: name.slice(0, 120), status: "draft" } });

  // Parents before children, so each copied step can point at its copied parent.
  const newIds = new Map<string, string>();
  let pending = nodes;
  while (pending.length) {
    const ready = pending.filter((node) => !node.parentId || newIds.has(node.parentId));
    if (ready.length === 0) break; // a step whose parent is gone: nothing to hang it on
    for (const node of ready) {
      // Every setting is copied as is; only identity and the tree links change.
      const settings = Object.fromEntries(Object.entries(node).filter(([key]) => !OWN_KEYS.has(key))) as Omit<
        typeof node,
        "id" | "automationId" | "parentId" | "createdAt" | "updatedAt"
      >;
      const created = await tx.automationNode.create({
        data: { ...settings, automationId: copy.id, parentId: node.parentId ? newIds.get(node.parentId)! : null },
      });
      newIds.set(node.id, created.id);
    }
    pending = pending.filter((node) => !newIds.has(node.id));
  }
  if (!nodes.some((node) => node.type === "trigger")) {
    await tx.automationNode.create({ data: { automationId: copy.id, type: "trigger" } });
  }

  for (const formId of new Set(formIds)) {
    await tx.automationTrigger.create({ data: { automationId: copy.id, formId } });
  }
  return copy.id;
}
