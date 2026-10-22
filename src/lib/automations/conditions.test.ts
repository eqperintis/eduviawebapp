import { describe, expect, it } from "vitest";
import { evaluateCondition } from "@/lib/automations/conditions";

// A booking of Maths + Science for a Year 3 student, asking for Saturday
// 2026-09-12 at 16:00 Kuala Lumpur time (08:00 UTC).
const TRIGGER_DATA = {
  subjects: ["Mathematics", "Science"],
  studentAge: 3,
  preferredAt: "2026-09-12T08:00:00.000Z",
  school: "SK Taman Desa",
  parentName: "Aisyah",
  parentEmail: "aisyah@example.com",
  parentPhone: "+60123456789",
  blockCount: 2,
  submittedVia: "public_link",
  isNewCustomer: "yes",
  studentName: "Ahmad",
};

function check(field: string, operator: string, value?: unknown) {
  return evaluateCondition({
    field,
    operator,
    value: value === undefined ? null : JSON.stringify(value),
    triggerData: TRIGGER_DATA,
  });
}

describe("evaluateCondition — multi-value fields", () => {
  it("matches when any booked subject is the one picked", () => {
    expect(check("subjects", "is", ["Science"])).toBe(true);
    expect(check("subjects", "is", ["Mathematics"])).toBe(true);
  });

  it("does not match a subject they did not book", () => {
    expect(check("subjects", "is", ["English"])).toBe(false);
  });

  it('"is not" is false when the subject is among those booked', () => {
    expect(check("subjects", "is_not", ["Science"])).toBe(false);
    expect(check("subjects", "is_not", ["English"])).toBe(true);
  });

  it("matches any of several picked subjects", () => {
    expect(check("subjects", "is_one_of", ["English", "Science"])).toBe(true);
    expect(check("subjects", "is_one_of", ["English", "Bahasa Melayu"])).toBe(false);
  });
});

describe("evaluateCondition — numbers", () => {
  it("compares the student's year", () => {
    expect(check("studentAge", "is", [3])).toBe(true);
    expect(check("studentAge", "gt", [2])).toBe(true);
    expect(check("studentAge", "gt", [3])).toBe(false);
    expect(check("studentAge", "lte", [3])).toBe(true);
    expect(check("studentAge", "between", [2, 4])).toBe(true);
    expect(check("studentAge", "between", [4, 6])).toBe(false);
  });

  it("accepts a reversed between range", () => {
    expect(check("studentAge", "between", [4, 2])).toBe(true);
  });

  it("counts how many subjects were booked", () => {
    expect(check("blockCount", "is", [2])).toBe(true);
    expect(check("blockCount", "gt", [1])).toBe(true);
  });
});

describe("evaluateCondition — text", () => {
  it("is case-insensitive", () => {
    expect(check("school", "is", ["sk taman desa"])).toBe(true);
    expect(check("parentEmail", "contains", ["EXAMPLE.COM"])).toBe(true);
  });

  it("handles starts_with and empties", () => {
    expect(check("parentPhone", "starts_with", ["+60"])).toBe(true);
    expect(check("parentPhone", "starts_with", ["+65"])).toBe(false);
    expect(check("school", "is_empty")).toBe(false);
    expect(check("school", "is_not_empty")).toBe(true);
  });
});

describe("evaluateCondition — dates read as Kuala Lumpur time", () => {
  it("knows 08:00 UTC is 16:00 in KL, not 08:00", () => {
    expect(check("preferredAt", "time_after", ["15:00"])).toBe(true);
    expect(check("preferredAt", "time_before", ["09:00"])).toBe(false);
  });

  it("treats Saturday as a weekend", () => {
    expect(check("preferredAt", "is_weekend")).toBe(true);
    expect(check("preferredAt", "is_weekday")).toBe(false);
  });

  it("compares calendar dates", () => {
    expect(check("preferredAt", "date_after", ["2026-09-11"])).toBe(true);
    expect(check("preferredAt", "date_before", ["2026-09-11"])).toBe(false);
    expect(check("preferredAt", "date_between", ["2026-09-10", "2026-09-14"])).toBe(true);
  });
});

describe("evaluateCondition — safety", () => {
  it("sends people down the No path when a condition is half-configured", () => {
    expect(check("subjects", "")).toBe(false);
    expect(check("", "is", ["Science"])).toBe(false);
    expect(check("subjects", "not_a_real_operator", ["Science"])).toBe(false);
  });

  it("does not match an unknown field", () => {
    expect(check("does_not_exist", "is", ["anything"])).toBe(false);
  });
});

describe("evaluateCondition — a field name typed in by the owner", () => {
  // A site sends "Monthly revenue" from a plain <select>, learned as text.
  const data = { "Monthly revenue": "Above RM300K" };
  const check = (operator: string, value: unknown) =>
    evaluateCondition({ field: "Monthly revenue", operator, value: JSON.stringify(value), triggerData: data });

  it('"is one of" matches any of the typed values, ignoring case', () => {
    expect(check("is_one_of", ["RM100K-RM300K", "above rm300k"])).toBe(true);
    expect(check("is_one_of", ["Below RM10K"])).toBe(false);
  });
});
