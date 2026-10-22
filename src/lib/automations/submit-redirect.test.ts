import { describe, expect, it } from "vitest";
import { findSubmitRedirect, reachedAtSubmit, type FlowNode } from "./submit-redirect";

function node(id: string, parentId: string | null, type: string, extra: Partial<FlowNode> = {}): FlowNode {
  return {
    id,
    parentId,
    branch: "next",
    type,
    url: null,
    conditionField: null,
    conditionOperator: null,
    conditionValue: null,
    ...extra,
  };
}

// trigger -> condition (year is 3) -> yes: redirect A, no: redirect B
const flow: FlowNode[] = [
  node("t", null, "trigger"),
  node("c", "t", "condition", { conditionField: "year", conditionOperator: "is", conditionValue: JSON.stringify("3") }),
  node("a", "c", "redirect", { branch: "yes", url: "https://example.com/a" }),
  node("b", "c", "redirect", { branch: "no", url: "https://example.com/b" }),
];

describe("findSubmitRedirect", () => {
  it("takes the Yes branch when the answer matches", () => {
    expect(findSubmitRedirect(flow, "t", { year: "3" })).toBe("https://example.com/a");
  });

  it("takes the No branch when it does not", () => {
    expect(findSubmitRedirect(flow, "t", { year: "5" })).toBe("https://example.com/b");
  });

  it("still finds a Redirect placed directly under the trigger", () => {
    const direct = [node("t", null, "trigger"), node("r", "t", "redirect", { url: "https://example.com/x" })];
    expect(findSubmitRedirect(direct, "t", {})).toBe("https://example.com/x");
  });

  it("goes through a Send Email that happens instantly", () => {
    const viaEmail = [
      node("t", null, "trigger"),
      node("e", "t", "send_email"),
      node("r", "e", "redirect", { url: "https://example.com/x" }),
    ];
    expect(findSubmitRedirect(viaEmail, "t", {})).toBe("https://example.com/x");
  });

  it("does not go past a Wait", () => {
    const afterWait = [
      node("t", null, "trigger"),
      node("w", "t", "wait"),
      node("r", "w", "redirect", { url: "https://example.com/x" }),
    ];
    expect(findSubmitRedirect(afterWait, "t", {})).toBeNull();
  });

  it("does not act on a Condition about an email being opened", () => {
    const engagement = [
      node("t", null, "trigger"),
      node("e", "t", "send_email"),
      node("c", "e", "condition", { conditionField: "engagement:e", conditionOperator: "opened" }),
      node("r", "c", "redirect", { branch: "yes", url: "https://example.com/x" }),
    ];
    expect(findSubmitRedirect(engagement, "t", {})).toBeNull();
  });

  it("returns nothing when the chosen branch has no step", () => {
    const noBranch = flow.filter((n) => n.id !== "b");
    expect(findSubmitRedirect(noBranch, "t", { year: "5" })).toBeNull();
  });
});

describe("reachedAtSubmit", () => {
  it("is true directly under the trigger and under an answer Condition", () => {
    expect(reachedAtSubmit(flow, "t")).toBe(true);
    expect(reachedAtSubmit(flow, "c")).toBe(true);
  });

  it("is false after a Wait", () => {
    const afterWait = [node("t", null, "trigger"), node("w", "t", "wait")];
    expect(reachedAtSubmit(afterWait, "w")).toBe(false);
  });
});
