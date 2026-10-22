/**
 * Email bodies are written in the rich editor and stored as HTML. Steps
 * saved before the editor existed hold plain text; these helpers tell the
 * two apart and turn plain text into the editor's HTML. Free of server
 * imports so the editor can use them.
 */

const BLOCK_START = /^\s*<(p|h[1-6]|ul|ol|blockquote|hr|div)[\s>/]/i;

export function isRichHtml(content: string | null | undefined): boolean {
  return BLOCK_START.test(content ?? "");
}

function escape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** A blank line starts a paragraph, a single line break stays a line break. */
export function plainToHtml(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escape(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/** The editor's HTML for any stored body, old plain text included. */
export function toEditorHtml(content: string | null | undefined): string {
  if (!content) return "";
  return isRichHtml(content) ? content : plainToHtml(content);
}

/** True when the HTML has no words in it (an empty editor is "<p></p>"). */
export function richTextIsEmpty(html: string): boolean {
  const text = html
    .replace(/<hr[^>]*>/gi, "x")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;| /g, " ")
    .trim();
  return text.length === 0;
}

/**
 * What a typed link becomes: "quolume.com" → "https://quolume.com". Keeps
 * mailto:, tel: and {{variables}}; anything else (javascript: and friends)
 * is refused with null.
 */
export function normalizeLink(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (/^\{\{[^}]+\}\}/.test(value)) return value;
  if (/^(https?:|mailto:|tel:)/i.test(value)) return value;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return null;
  if (/^[^\s@/]+@[^\s@]+\.[^\s@]+$/.test(value)) return `mailto:${value}`;
  if (/^[\w-]+(\.[\w-]+)+/.test(value)) return `https://${value}`;
  return null;
}
