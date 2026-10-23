import { describe, expect, it } from "vitest";
import { utmFromUrl, withUtmFromReferrer } from "./utm";
import { labelFromKey, learnFields } from "./fields";
import { buildTrigger } from "@/lib/automations/triggers";
import { fillText, answerRows } from "@/lib/email/render";

describe("UTM tags", () => {
  it("reads the five tags from an address and ignores the rest", () => {
    expect(utmFromUrl("https://eduvia.my/enquire?utm_source=facebook&utm_campaign=holiday%20camp&utm_id=9&x=1")).toEqual({
      utm_source: "facebook",
      utm_campaign: "holiday camp",
    });
    expect(utmFromUrl("https://eduvia.my/")).toEqual({});
    expect(utmFromUrl("not a url")).toEqual({});
  });

  it("fills in tags the form didn't send, and never overrides what it did", () => {
    const referrer = "https://eduvia.my/?utm_source=google&utm_medium=cpc";
    expect(withUtmFromReferrer({ email: "a@b.co", utm_source: "facebook" }, referrer)).toEqual({
      email: "a@b.co",
      utm_source: "facebook",
      utm_medium: "cpc",
    });
    const data = { email: "a@b.co" };
    expect(withUtmFromReferrer(data, "https://eduvia.my/")).toBe(data);
  });

  it("gives the tags clear names and lists them in their own group", () => {
    expect(labelFromKey("utm_source")).toBe("UTM source (e.g. facebook)");
    const fields = learnFields([], { utm_source: "facebook", email: "a@b.co", level: "Primary" })!;
    const trigger = buildTrigger([{ publicId: "x", name: "Enquiry", fields: JSON.stringify(fields) }]);
    const keys = trigger.fields.map((field) => field.key);
    expect(keys.indexOf("utm_source")).toBeGreaterThan(keys.indexOf("level"));
    expect(trigger.fields.find((field) => field.key === "utm_source")?.group).toBe("Where they came from (UTM)");
    expect(trigger.fields.find((field) => field.key === "level")?.group).toBeUndefined();
  });

  it("keeps tags out of {{answers}} in emails to the person, but not out of {{utm_source}}", () => {
    const ctx = { name: "Aisyah", email: "a@b.co", formName: "Enquiry", submittedAt: "now", answers: { level: "Primary", utm_source: "facebook" } };
    expect(answerRows(ctx).map(([label]) => label)).toEqual(["Level", "UTM source (e.g. facebook)"]);
    expect(answerRows({ ...ctx, answersWithoutUtm: true }).map(([label]) => label)).toEqual(["Level"]);
    expect(fillText("From {{utm_source}}", { ...ctx, answersWithoutUtm: true })).toBe("From facebook");
  });
});
