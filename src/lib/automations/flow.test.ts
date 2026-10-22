import { describe, expect, it } from "vitest";
import { describeNode, type StoredNode } from "./flow";
import { buildTrigger } from "./triggers";

const base: StoredNode = {
  id: "n", type: "google_sheets", parentId: "t", branch: "main", recipients: null, subject: null, content: null,
  ctaLabel: null, url: null, delayMinutes: null, conditionField: null, conditionOperator: null, conditionValue: null,
};
const trigger = buildTrigger([{ publicId: "a", name: "Apply", fields: null }]);

describe("Google Sheets step summary", () => {
  it("says when no sheet is chosen yet", () => {
    expect(describeNode(base, trigger)).toEqual({ title: "Google Sheets", detail: "No sheet chosen" });
  });
  it("names the spreadsheet and tab", () => {
    const node = { ...base, url: "https://docs.google.com/spreadsheets/d/abc/edit", subject: "Leads", ctaLabel: "Form responses 1" };
    expect(describeNode(node, trigger).detail).toBe("Leads · Form responses 1");
  });
});
