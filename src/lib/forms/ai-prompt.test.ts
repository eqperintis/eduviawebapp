import { describe, expect, it } from "vitest";
import { buildAiPrompt } from "./ai-prompt";

describe("buildAiPrompt", () => {
  const endpoint = "https://marketing.eduvia.my/f/eduvia-enquiry";

  it("carries the endpoint, the known fields, the Eduvia look and the domain lock", () => {
    const prompt = buildAiPrompt({
      endpoint,
      formName: "Apply",
      fields: [{ key: "revenue", label: "Monthly revenue", kind: "choice", options: ["Below RM10K", "Above RM300K"] }],
      allowedDomains: ["eduvia.my"],
    });
    expect(prompt).toContain(endpoint);
    expect(prompt).toContain('`revenue`: Monthly revenue (pick one: "Below RM10K", "Above RM300K")');
    expect(prompt).toContain("Claston");
    expect(prompt).toContain("#141A5E");
    expect(prompt).toContain("only accepts submissions sent from pages on: eduvia.my");
    expect(prompt).toContain("# React");
    expect(prompt).toContain('<script src="https://marketing.eduvia.my/utm.js" defer></script>');
    expect(prompt).toContain("data-utm");
  });

  it("says so when the form has no fields or domain lock yet", () => {
    const prompt = buildAiPrompt({ endpoint, formName: "New", fields: [], allowedDomains: [] });
    expect(prompt).toContain("doesn't have any fields yet");
    expect(prompt).toContain("accepts submissions from any site");
  });
});
