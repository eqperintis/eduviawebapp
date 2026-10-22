import { describe, expect, it } from "vitest";
import { defaultColumns, guessColumnValue, mergeColumns, parseColumns } from "./sheet-columns";
import type { TriggerField } from "./triggers";

const fields: TriggerField[] = [
  { key: "First name", label: "First name", kind: "text" },
  { key: "email", label: "Email", kind: "email" },
  { key: "revenue", label: "Monthly revenue", kind: "text" },
];

describe("guessColumnValue", () => {
  it("matches a column to a field by key or label, ignoring case and spacing", () => {
    expect(guessColumnValue("first_name", fields)).toBe("{{First name}}");
    expect(guessColumnValue("Monthly Revenue", fields)).toBe("{{revenue}}");
  });
  it("knows the submission time and leaves the rest empty", () => {
    expect(guessColumnValue("Timestamp", fields)).toBe("{{submitted_at}}");
    expect(guessColumnValue("Submission Date & Time", fields)).toBe("{{submitted_at}}");
    expect(guessColumnValue("Email", fields)).toBe("{{email}}");
    expect(guessColumnValue("Full name", fields)).toBe("");
    expect(guessColumnValue("Notes", fields)).toBe("");
  });
});

describe("mergeColumns", () => {
  it("follows the sheet's order, keeps earlier choices, and keeps columns still to be added", () => {
    const saved = [
      { header: "Notes", value: "From website" },
      { header: "Source", value: "Website" },
    ];
    expect(mergeColumns(["Timestamp", "Notes", ""], saved, fields)).toEqual([
      { header: "Timestamp", value: "{{submitted_at}}" },
      { header: "Notes", value: "From website" },
      { header: "Source", value: "Website" },
    ]);
  });
});

describe("defaultColumns and parseColumns", () => {
  it("starts a blank tab with the submission time and every field the form sent", () => {
    expect(defaultColumns(fields).map((column) => column.header)).toEqual([
      "Submission date & time",
      "First name",
      "Email",
      "Monthly revenue",
    ]);
    expect(defaultColumns([]).map((column) => column.header)).toEqual(["Submission date & time"]);
  });
  it("ignores anything that isn't a list of columns", () => {
    expect(parseColumns("not json")).toEqual([]);
    expect(parseColumns('[{"header":"A","value":"{{x}}"},{"oops":1}]')).toEqual([{ header: "A", value: "{{x}}" }]);
  });
});
