import { describe, expect, it } from "vitest";
import { extractEmail, extractName, labelFromKey, learnFields } from "./fields";

describe("learnFields", () => {
  it("adds new keys with a guessed type", () => {
    const learned = learnFields([], { email: "a@b.co", whatsapp: "+60 12", age: 30, interests: ["Ads"], note: "hi" });
    expect(learned?.map((field) => [field.key, field.kind])).toEqual([
      ["email", "email"],
      ["whatsapp", "phone"],
      ["age", "number"],
      ["interests", "choice"],
      ["note", "text"],
    ]);
    expect(learned?.find((field) => field.key === "interests")).toMatchObject({ options: ["Ads"], multi: true });
  });

  it("keeps short text answers as suggestions, but not long ones", () => {
    const learned = learnFields([], { revenue: "RM30K-RM100K", now: "x".repeat(200) });
    expect(learned?.find((field) => field.key === "revenue")?.options).toEqual(["RM30K-RM100K"]);
    expect(learned?.find((field) => field.key === "now")?.options).toBeUndefined();
  });

  it("collects new choices and reports no change when there is none", () => {
    const first = learnFields([{ key: "revenue", label: "Revenue", kind: "choice", options: ["A"] }], { revenue: "B" });
    expect(first?.[0].options).toEqual(["A", "B"]);
    expect(learnFields(first!, { revenue: "A" })).toBeNull();
  });

  it("never learns junk keys", () => {
    expect(learnFields([], { "<script>": "x" })).toBeNull();
  });
});

describe("who submitted", () => {
  it("finds the email and name", () => {
    expect(extractEmail({ work_email: "x@y.co" })).toBe("x@y.co");
    expect(extractEmail({ email: "not an email" })).toBe("");
    expect(extractName({ first_name: "Alif", last_name: "K" })).toBe("Alif K");
    // What quolume.com's apply form sends.
    expect(extractName({ "First name": "Alif", "Last name": "K", email: "a@b.co" })).toBe("Alif K");
    expect(extractName({ fullName: "Alif K" })).toBe("Alif K");
    expect(labelFromKey("monthlyRevenue")).toBe("Monthly revenue");
  });
});
