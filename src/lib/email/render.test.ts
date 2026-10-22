import { describe, expect, it } from "vitest";
import { fillHtml, fillText, type TemplateContext } from "./render";

const ctx: TemplateContext = {
  name: "",
  email: "a@b.co",
  formName: "Apply",
  submittedAt: "6 Oct 2026",
  answers: { business: "Tuition <centre>", goals: ["Scale", "Hire"] },
  labels: { business: "Business name" },
};

describe("templates", () => {
  it("fills text tokens and falls back for a missing name", () => {
    expect(fillText("Hi {{name}}, re {{ business }} / {{goals}} / {{missing}}", ctx)).toBe(
      "Hi there, re Tuition <centre> / Scale, Hire / ",
    );
  });

  it("escapes answers in HTML and renders {{answers}} as a table", () => {
    const html = fillHtml("Hi {{name}}\n\n{{answers}}", ctx);
    expect(html).toContain("Tuition &lt;centre&gt;");
    expect(html).toContain("Business name");
    expect(html).not.toContain("<centre>");
  });

  it("escapes the owner's own text too", () => {
    expect(fillHtml("<b>bold</b>", ctx)).toContain("&lt;b&gt;");
  });
});
