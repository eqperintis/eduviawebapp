import { describe, expect, it } from "vitest";
import { buildAiPrompt } from "./ai-prompt";

describe("buildAiPrompt", () => {
  const endpoint = "https://marketing.quolume.com/f/quolume-apply";

  it("carries the endpoint, the known fields, the Quolume look and the domain lock", () => {
    const prompt = buildAiPrompt({
      endpoint,
      formName: "Apply",
      fields: [{ key: "revenue", label: "Monthly revenue", kind: "choice", options: ["Below RM10K", "Above RM300K"] }],
      allowedDomains: ["quolume.com"],
    });
    expect(prompt).toContain(endpoint);
    expect(prompt).toContain('`revenue`: Monthly revenue (pick one: "Below RM10K", "Above RM300K")');
    expect(prompt).toContain("Plus Jakarta Sans");
    expect(prompt).toContain("only accepts submissions sent from pages on: quolume.com");
    expect(prompt).toContain("# React");
  });

  it("says so when the form has no fields or domain lock yet", () => {
    const prompt = buildAiPrompt({ endpoint, formName: "New", fields: [], allowedDomains: [] });
    expect(prompt).toContain("doesn't have any fields yet");
    expect(prompt).toContain("accepts submissions from any site");
  });
});
