import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { mergeScannedFields, scanFormHtml } from "@/lib/forms/page-scan";
import type { FieldDef } from "@/lib/forms/fields";

const quolume = readFileSync(join(__dirname, "../../../../site/index.html"), "utf8");

describe("scanFormHtml", () => {
  it("reads every option of quolume.com's apply form", () => {
    const fields = scanFormHtml(quolume, "quolume-apply", true);
    expect(fields).not.toBeNull();
    const byName = new Map(fields!.map((field) => [field.name, field]));
    expect(byName.get("revenue")).toMatchObject({
      label: "Monthly revenue",
      kind: "choice",
      options: ["Below RM10K", "RM10K-RM30K", "RM30K-RM100K", "RM100K-RM300K", "Above RM300K"],
    });
    expect(byName.get("team")?.options).toEqual(["Just me", "2-5", "6-15", "16-50", "50+"]);
    const industry = byName.get("industry")!;
    expect(industry.label).toBe("Industry");
    expect(industry.options).toContain("Beauty & salon");
    expect(industry.options).toContain("Other");
    expect(industry.options).not.toContain("No match. Choose Other.");
    expect(byName.get("first_name")?.label).toBe("First name");
    expect(byName.has("_gotcha")).toBe(false);
  });

  it("needs the page to mention the endpoint when strict", () => {
    expect(scanFormHtml(quolume, "someone-else", true)).toBeNull();
  });

  it("prefers the form whose action is the endpoint, and reads radio and checkbox groups", () => {
    const html = `
      <form action="/newsletter"><input name="email"></form>
      <form action="https://marketing.quolume.com/f/abc123" method="POST">
        <fieldset><legend>How did you hear about us?</legend>
          <label><input type="radio" name="source" value="Instagram"> Instagram</label>
          <label><input type="radio" name="source" value="Friend"> A friend</label>
        </fieldset>
        <fieldset><legend>Interested in</legend>
          <input type="checkbox" id="i1" name="interests[]" value="Ads"><label for="i1">Ads</label>
          <input type="checkbox" id="i2" name="interests[]" value="SEO"><label for="i2">SEO</label>
        </fieldset>
        <label>Agree <input type="checkbox" name="agree"></label>
        <label for="c">City</label><input id="c" name="city" list="cities">
        <datalist id="cities"><option value="KL"><option value="Penang"></datalist>
        <input type="hidden" name="campaign" value="x">
      </form>`;
    const fields = scanFormHtml(html, "abc123", true)!;
    expect(fields.map((field) => field.name)).toEqual(["source", "interests[]", "agree", "city"]);
    expect(fields[0]).toMatchObject({ label: "How did you hear about us?", kind: "choice", options: ["Instagram", "Friend"] });
    expect(fields[1]).toMatchObject({ label: "Interested in", multi: true, options: ["Ads", "SEO"] });
    expect(fields[2].options).toEqual([]);
    expect(fields[3]).toMatchObject({ label: "City", kind: "text", options: ["KL", "Penang"] });
  });

  it("returns null when there is no form", () => {
    expect(scanFormHtml("<p>hi</p>", "abc", false)).toBeNull();
  });
});

describe("mergeScannedFields", () => {
  const scanned = scanFormHtml(quolume, "quolume-apply", true)!;

  it("gives fields learned under their question's name every option, page order first", () => {
    const learned: FieldDef[] = [
      { key: "Monthly revenue", label: "Monthly revenue", kind: "text", options: ["RM10K-RM30K", "Something old"] },
      { key: "First name", label: "First name", kind: "text", options: ["Aisyah"] },
    ];
    const merged = mergeScannedFields(learned, scanned)!;
    expect(merged.find((field) => field.key === "Monthly revenue")?.options).toEqual([
      "Below RM10K", "RM10K-RM30K", "RM30K-RM100K", "RM100K-RM300K", "Above RM300K", "Something old",
    ]);
    // Free text stays as learned; the kind isn't changed under a saved condition.
    expect(merged.find((field) => field.key === "First name")).toEqual(learned[1]);
    expect(merged.find((field) => field.key === "Monthly revenue")?.kind).toBe("text");
  });

  it("only adds questions the form hasn't sent when they have options", () => {
    const learned: FieldDef[] = [{ key: "email", label: "Email", kind: "email" }];
    const merged = mergeScannedFields(learned, scanned)!;
    const keys = merged.map((field) => field.key);
    expect(keys).toContain("revenue");
    expect(keys).not.toContain("industry_other");
    expect(keys).not.toContain("first_name");
  });

  it("adds every question to a form that has learned nothing yet", () => {
    const merged = mergeScannedFields([], scanned)!;
    expect(merged.map((field) => field.key)).toContain("first_name");
  });

  it("reports no change the second time", () => {
    const once = mergeScannedFields([], scanned)!;
    expect(mergeScannedFields(once, scanned)).toBeNull();
  });
});
