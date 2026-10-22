import { describe, expect, it } from "vitest";
import { collectEntries, parseSubmissionBody, wantsJson } from "./parse";

function post(body: BodyInit, type: string, accept = "") {
  return new Request("https://marketing.eduvia.my/f/x", {
    method: "POST",
    body,
    headers: { "content-type": type, ...(accept ? { accept } : {}) },
  });
}

describe("parseSubmissionBody", () => {
  it("reads a plain HTML form, with repeated keys as a list", async () => {
    const { data, meta } = await parseSubmissionBody(
      post("name=Alif&email=a%40b.co&interest=Ads&interest=SEO&_next=https%3A%2F%2Feduvia.my%2Fthanks", "application/x-www-form-urlencoded"),
    );
    expect(data).toEqual({ name: "Alif", email: "a@b.co", interest: ["Ads", "SEO"] });
    expect(meta.next).toBe("https://eduvia.my/thanks");
  });

  it("reads JSON from fetch()", async () => {
    const { data } = await parseSubmissionBody(post(JSON.stringify({ name: "Alif", revenue: "RM30K-RM100K", commit: "on" }), "application/json"));
    expect(data).toEqual({ name: "Alif", revenue: "RM30K-RM100K", commit: "on" });
  });

  it("reads multipart and keeps only a file's name", async () => {
    const form = new FormData();
    form.append("name", "Alif");
    form.append("tags[]", "a");
    form.append("cv", new File(["x"], "cv.pdf"));
    const { data } = await parseSubmissionBody(new Request("https://x/f/x", { method: "POST", body: form }));
    expect(data).toEqual({ name: "Alif", tags: ["a"], cv: "[file: cv.pdf]" });
  });

  it("rejects a JSON array", async () => {
    await expect(parseSubmissionBody(post("[1,2]", "application/json"))).rejects.toThrow();
  });
});

describe("collectEntries", () => {
  it("flags a filled honeypot and keeps _ keys out of the answers", () => {
    const { data, meta } = collectEntries([
      ["email", "x@y.co"],
      ["_gotcha", "spam"],
      ["_subject", "Hello"],
      ["_replyto", "r@y.co"],
    ]);
    expect(data).toEqual({ email: "x@y.co" });
    expect(meta).toEqual({ next: "", subject: "Hello", replyTo: "r@y.co", spam: true });
  });

  it("treats an empty honeypot as a person", () => {
    expect(collectEntries([["_gotcha", ""]]).meta.spam).toBe(false);
  });
});

describe("wantsJson", () => {
  it("follows Accept, then the body type", () => {
    expect(wantsJson(post("", "application/x-www-form-urlencoded", "application/json"))).toBe(true);
    expect(wantsJson(post("", "application/json"))).toBe(true);
    expect(wantsJson(post("", "application/x-www-form-urlencoded", "text/html,*/*"))).toBe(false);
  });
});
