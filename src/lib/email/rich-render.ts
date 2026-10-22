import { parseHTML } from "linkedom";
import { BRAND } from "@/lib/brand";
import { answerRows, answersTableHtml, fillHtml, tokenValue, type TemplateContext } from "@/lib/email/render";
import { isRichHtml } from "@/lib/email/rich-text";

/**
 * Turns the rich editor's HTML into an email body: only the formatting the
 * editor makes is kept (anything else is unwrapped or dropped), every
 * {{variable}} is filled in as text (a visitor's answer can never become
 * markup or a javascript: link), and each tag gets inline styles, since
 * Gmail and Outlook ignore stylesheets.
 */

const KEPT = new Set(["p", "br", "strong", "b", "em", "i", "u", "s", "a", "h1", "h2", "h3", "ul", "ol", "li", "blockquote", "hr", "code"]);
const DROPPED = new Set(["script", "style", "iframe", "object", "embed", "form", "input", "button", "select", "textarea", "img", "svg", "math", "link", "meta", "head", "title"]);
const TOKEN = /\{\{\s*([\w\-. \[\]]+?)\s*\}\}/g;
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

const TAG_STYLE: Record<string, string> = {
  p: "margin:0 0 16px;",
  h1: `margin:8px 0 12px;font-size:24px;line-height:1.25;font-weight:700;color:${BRAND.ink};`,
  h2: `margin:8px 0 10px;font-size:19px;line-height:1.3;font-weight:700;color:${BRAND.ink};`,
  h3: `margin:8px 0 8px;font-size:16px;line-height:1.35;font-weight:700;color:${BRAND.ink};`,
  ul: "margin:0 0 16px;padding:0 0 0 24px;",
  ol: "margin:0 0 16px;padding:0 0 0 24px;",
  li: "margin:0 0 6px;",
  a: `color:${BRAND.accentInk};text-decoration:underline;`,
  blockquote: `margin:0 0 16px;padding:2px 0 2px 14px;border-left:3px solid #D6D6D2;color:${BRAND.muted};`,
  hr: "border:0;border-top:1.5px dashed #D6D6D2;margin:20px 0;",
  code: `font-family:${MONO};font-size:13px;background:${BRAND.bg};padding:1px 5px;border-radius:4px;`,
};

/** Keeps alignment and the editor's indent from a style attribute, nothing else. */
function keptStyle(style: string | null): { align?: string; indent?: number } {
  if (!style) return {};
  const align = /text-align\s*:\s*(left|center|right|justify)/i.exec(style)?.[1]?.toLowerCase();
  const margin = /margin-left\s*:\s*(\d{1,3})px/i.exec(style)?.[1];
  const indent = margin ? Math.min(400, Number(margin)) : undefined;
  return { align, indent: indent || undefined };
}

function safeHref(value: string): string | null {
  const href = value.trim();
  return /^(https?:|mailto:|tel:)/i.test(href) ? href : null;
}

function fillTokens(text: string, ctx: TemplateContext): string {
  return text.replace(TOKEN, (_, token: string) => {
    if (token === "answers") return answerRows(ctx).map(([label, value]) => `${label}: ${value}`).join("\n");
    return tokenValue(token, ctx) ?? "";
  });
}

export function renderRichEmail(html: string, ctx: TemplateContext): string {
  const { document } = parseHTML(`<!doctype html><html><body><div id="root">${html}</div></body></html>`);
  const root = document.getElementById("root")!;

  // 1. Only the editor's own formatting survives.
  const clean = (element: Element) => {
    for (const child of [...element.children]) {
      const tag = child.tagName.toLowerCase();
      if (DROPPED.has(tag)) {
        child.remove();
        continue;
      }
      clean(child);
      if (!KEPT.has(tag)) {
        child.replaceWith(...child.childNodes);
        continue;
      }
      const { align, indent } = keptStyle(child.getAttribute("style"));
      const href = tag === "a" ? child.getAttribute("href") : null;
      for (const name of [...child.getAttributeNames()]) child.removeAttribute(name);
      if (href) child.setAttribute("href", href);
      const extra = `${align ? `text-align:${align};` : ""}${indent ? `margin-left:${indent}px;` : ""}`;
      child.setAttribute("data-extra", extra);
    }
  };
  clean(root);

  // Blank lines left at the very start or end would only add a gap.
  const blank = (node: ChildNode | null) =>
    !!node && (node.nodeType === 3 ? !node.textContent?.trim() : (node as Element).tagName?.toLowerCase() === "p" && !node.textContent?.trim());
  while (blank(root.firstChild)) root.firstChild!.remove();
  while (blank(root.lastChild)) root.lastChild!.remove();

  // 2. A paragraph that is only {{answers}} becomes the answers table.
  for (const paragraph of [...root.querySelectorAll("p")]) {
    if (/^\s*\{\{\s*answers\s*\}\}\s*$/.test(paragraph.textContent ?? "")) {
      const holder = document.createElement("div");
      holder.innerHTML = answersTableHtml(ctx);
      paragraph.replaceWith(...holder.childNodes);
    }
  }

  // 3. Variables are filled in as plain text: in words, and in link addresses.
  const walker = document.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
  const texts: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) texts.push(node as Text);
  for (const node of texts) {
    const value = node.nodeValue ?? "";
    if (!value.includes("{{")) continue;
    const lines = fillTokens(value, ctx).split("\n");
    node.replaceWith(
      ...lines.flatMap((line, index) => (index === 0 ? [document.createTextNode(line)] : [document.createElement("br"), document.createTextNode(line)])),
    );
  }
  for (const link of [...root.querySelectorAll("a")]) {
    const href = link.getAttribute("href");
    const filled = href ? safeHref(fillTokens(href, ctx).replace(/\s+/g, "")) : null;
    if (filled) {
      link.setAttribute("href", filled);
      link.setAttribute("target", "_blank");
    } else {
      // No usable address: keep the words, lose the link.
      link.replaceWith(...link.childNodes);
    }
  }

  // 4. Inline styles, because email clients ignore stylesheets.
  for (const element of [...root.querySelectorAll("*")]) {
    const tag = element.tagName.toLowerCase();
    const extra = element.getAttribute("data-extra") ?? "";
    element.removeAttribute("data-extra");
    const base = TAG_STYLE[tag];
    if (!base && !extra) continue;
    // A paragraph inside a list item is spaced by the item.
    const inItem = tag === "p" && element.parentElement?.tagName.toLowerCase() === "li";
    element.setAttribute("style", `${inItem ? "margin:0;" : base ?? ""}${extra}`);
    // An empty line in the editor stays an empty line in the email.
    if (tag === "p" && !element.textContent?.trim() && !element.querySelector("br")) element.appendChild(document.createElement("br"));
  }

  return root.innerHTML;
}

/** Any stored body, rich or (from before the editor) plain text, as email HTML. */
export function renderEmailBody(content: string, ctx: TemplateContext): string {
  return isRichHtml(content) ? renderRichEmail(content, ctx) : fillHtml(content, ctx);
}
