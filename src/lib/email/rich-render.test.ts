import { describe, expect, it } from "vitest";
import { renderEmailBody, renderRichEmail } from "@/lib/email/rich-render";
import { normalizeLink, plainToHtml, richTextIsEmpty, toEditorHtml } from "@/lib/email/rich-text";
import type { TemplateContext } from "@/lib/email/render";

const ctx: TemplateContext = {
  name: "Aisyah",
  email: "a@example.com",
  formName: "Apply",
  submittedAt: "7 Oct 2026",
  answers: { "Monthly revenue": "Above RM300K", website: "https://aisyah.my", evil: "<b>x</b>", jsurl: "javascript:alert(1)" },
};

describe("renderRichEmail", () => {
  it("keeps the editor's formatting, with inline styles", () => {
    const html = renderRichEmail(
      '<h1>Hi</h1><p style="text-align: center">Centred <strong>bold</strong> <em>it</em> <u>under</u></p><p style="margin-left: 48px">Indented</p><ul><li><p>One</p></li></ul><blockquote><p>Quote</p></blockquote><hr>',
      ctx,
    );
    expect(html).toContain('<h1 style="margin:8px 0 12px;font-size:24px');
    expect(html).toMatch(/<p style="margin:0 0 16px;text-align:center;">Centred <strong>bold<\/strong> <em>it<\/em> <u>under<\/u><\/p>/);
    expect(html).toContain('<p style="margin:0 0 16px;margin-left:48px;">Indented</p>');
    expect(html).toContain('<li style="margin:0 0 6px;"><p style="margin:0;">One</p></li>');
    expect(html).toContain("border-left:3px solid");
    expect(html).toContain("<hr style=");
  });

  it("keeps links, styled, and opens them in a new tab", () => {
    const html = renderRichEmail('<p>Read <a href="https://eduvia.my/guide" target="_blank" rel="noopener" class="x">the guide</a></p>', ctx);
    expect(html).toContain('href="https://eduvia.my/guide"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('style="color:#1F63C6;text-decoration:underline;"');
    expect(html).not.toMatch(/rel=|class=/);
  });

  it("fills variables as text, in words and in links", () => {
    const html = renderRichEmail(
      '<p>Hi {{name}}, you said {{Monthly revenue}}. {{evil}}</p><p><a href="{{website}}">Your site</a> <a href="{{jsurl}}">bad</a> <a href="https://wa.me/{{nope}}">wa</a></p>',
      ctx,
    );
    expect(html).toContain("Hi Aisyah, you said Above RM300K. &lt;b&gt;x&lt;/b&gt;");
    expect(html).toContain('href="https://aisyah.my">Your site</a>');
    expect(html).not.toContain("javascript:");
    expect(html).toContain(" bad ");
    expect(html).toContain('href="https://wa.me/"');
  });

  it("turns a paragraph of {{answers}} into the answers table", () => {
    const html = renderRichEmail("<p>New one:</p><p>{{answers}}</p>", ctx);
    expect(html).toContain("<table");
    expect(html).toContain("Above RM300K");
    expect(html).not.toContain("{{answers}}");
  });

  it("drops scripts, images, event handlers and unknown tags", () => {
    const html = renderRichEmail(
      '<p onclick="x()">Hi<script>alert(1)</script><img src="x" onerror="y()"><span style="color:red">kept words</span></p><div><p>in div</p></div>',
      ctx,
    );
    expect(html).not.toMatch(/script|onclick|onerror|<img|<span|<div|color:red/);
    expect(html).toContain("kept words");
    expect(html).toContain("in div");
  });

  it("drops blank lines at the start and end", () => {
    expect(renderRichEmail("<p></p><p>a</p><p></p><p></p>", ctx)).toBe('<p style="margin:0 0 16px;">a</p>');
  });

  it("keeps an empty line visible", () => {
    expect(renderRichEmail("<p>a</p><p></p><p>b</p>", ctx)).toContain('<p style="margin:0 0 16px;"><br></p>');
  });
});

describe("renderEmailBody", () => {
  it("still renders plain text saved before the editor", () => {
    const html = renderEmailBody("Hi {{name}},\n\nThanks.", ctx);
    expect(html).toBe('<p style="margin:0 0 16px;">Hi Aisyah,</p><p style="margin:0 0 16px;">Thanks.</p>');
  });
});

describe("rich-text helpers", () => {
  it("converts plain text for the editor", () => {
    expect(plainToHtml("Hi <you>,\nline\n\nNext")).toBe("<p>Hi &lt;you&gt;,<br>line</p><p>Next</p>");
    expect(toEditorHtml("<p>Already</p>")).toBe("<p>Already</p>");
  });

  it("knows an empty editor", () => {
    expect(richTextIsEmpty("<p></p>")).toBe(true);
    expect(richTextIsEmpty("<p>&nbsp;</p><p></p>")).toBe(true);
    expect(richTextIsEmpty("<p>x</p>")).toBe(false);
  });

  it("normalizes typed links", () => {
    expect(normalizeLink("eduvia.my/apply")).toBe("https://eduvia.my/apply");
    expect(normalizeLink("john.doe@gmail.com")).toBe("mailto:john.doe@gmail.com");
    expect(normalizeLink("https://x.co")).toBe("https://x.co");
    expect(normalizeLink("{{website}}")).toBe("{{website}}");
    expect(normalizeLink("javascript:alert(1)")).toBeNull();
    expect(normalizeLink("hello")).toBeNull();
  });
});
