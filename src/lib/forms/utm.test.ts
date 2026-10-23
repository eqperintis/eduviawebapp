import { describe, expect, it } from "vitest";
import { buildTrackingLink, tagValue, utmFromUrl, withUtmFromReferrer } from "./utm";
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
    expect(trigger.fields.find((field) => field.key === "utm_source")?.group).toBe("Where they came from");
    expect(trigger.fields.find((field) => field.key === "level")?.group).toBeUndefined();
  });

  it("keeps tags out of {{answers}} in emails to the person, but not out of {{utm_source}}", () => {
    const ctx = { name: "Aisyah", email: "a@b.co", formName: "Enquiry", submittedAt: "now", answers: { level: "Primary", utm_source: "facebook" } };
    expect(answerRows(ctx).map(([label]) => label)).toEqual(["Level", "UTM source (e.g. facebook)"]);
    expect(answerRows({ ...ctx, answersWithoutTracking: true }).map(([label]) => label)).toEqual(["Level"]);
    expect(fillText("From {{utm_source}}", { ...ctx, answersWithoutTracking: true })).toBe("From facebook");
  });
});

describe("came_from", () => {
  it("has a clear label and sits with the UTM tags, out of {{answers}} to the person", () => {
    expect(labelFromKey("came_from")).toBe("Came from (website)");
    const fields = learnFields([], { came_from: "Instagram", level: "Primary" })!;
    const trigger = buildTrigger([{ publicId: "x", name: "Enquiry", fields: JSON.stringify(fields) }]);
    expect(trigger.fields.find((field) => field.key === "came_from")?.group).toBe("Where they came from");
    const ctx = { name: "A", email: "a@b.co", formName: "F", submittedAt: "now", answers: { level: "Primary", came_from: "Instagram" } };
    expect(answerRows({ ...ctx, answersWithoutTracking: true }).map(([label]) => label)).toEqual(["Level"]);
  });
});

describe("tracking links", () => {
  it("turns plain words into tags", () => {
    expect(tagValue("Holiday Camp 2026!")).toBe("holiday_camp_2026");
    expect(tagValue("  Café  Promo ")).toBe("cafe_promo");
    expect(tagValue("!!!")).toBe("");
  });

  it("builds the link, keeping what the page already has", () => {
    expect(buildTrackingLink({ page: "https://eduvia.my/enquire", source: "facebook", paid: true, campaign: "Holiday camp", content: "Video 1" })).toBe(
      "https://eduvia.my/enquire?utm_source=facebook&utm_medium=paid&utm_campaign=holiday_camp&utm_content=video_1",
    );
    expect(buildTrackingLink({ page: "https://eduvia.my/?ref=x#form", source: "whatsapp", paid: false, campaign: "" })).toBe(
      "https://eduvia.my/?ref=x&utm_source=whatsapp&utm_medium=messaging#form",
    );
    expect(buildTrackingLink({ page: "https://eduvia.my/", source: "Partner School", paid: false, campaign: "Fair" })).toBe(
      "https://eduvia.my/?utm_source=partner_school&utm_medium=referral&utm_campaign=fair",
    );
  });

  it("refuses a page that isn't a full web address, or no source", () => {
    expect(buildTrackingLink({ page: "eduvia.my", source: "facebook", paid: false, campaign: "x" })).toBeNull();
    expect(buildTrackingLink({ page: "javascript:alert(1)", source: "facebook", paid: false, campaign: "x" })).toBeNull();
    expect(buildTrackingLink({ page: "https://eduvia.my/", source: "  ", paid: false, campaign: "x" })).toBeNull();
  });
});
