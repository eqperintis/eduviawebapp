import { describe, expect, it } from "vitest";
import { buildTrigger, SUBMITTED_FORM_FIELD_KEY } from "./triggers";

const fields = (list: object[]) => JSON.stringify(list);

describe("buildTrigger", () => {
  it("lists one form's fields plus the built-ins", () => {
    const trigger = buildTrigger([{ publicId: "a", name: "Apply", fields: fields([{ key: "revenue", label: "Revenue", kind: "choice", options: ["Low"] }]) }]);
    expect(trigger.fields.map((field) => field.key)).toEqual(["revenue", "_email", "_name", "_submitted_at"]);
  });

  it("adds 'which form' and groups fields for several forms", () => {
    const trigger = buildTrigger([
      { publicId: "a", name: "Apply", fields: fields([{ key: "email", label: "Email", kind: "email" }, { key: "revenue", label: "Revenue", kind: "text" }]) },
      { publicId: "b", name: "Newsletter", fields: fields([{ key: "email", label: "Email", kind: "email" }]) },
    ]);
    expect(trigger.fields[0]).toMatchObject({ key: SUBMITTED_FORM_FIELD_KEY, options: [{ value: "a", label: "Apply" }, { value: "b", label: "Newsletter" }] });
    expect(trigger.fields.find((field) => field.key === "revenue")?.group).toBe("Apply");
    expect(trigger.fields.find((field) => field.key === "email")?.group).toBe("On more than one form");
  });
});
