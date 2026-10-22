/**
 * The Eduvia brand, taken from its logo: navy ink for text and buttons, gold
 * as the highlight (the logo's chevron), sky blue for links and labels (the
 * logo's square), on a soft cool-white page with white rounded cards.
 * Headings use Claston, the logo's own typeface; body text uses Plus Jakarta
 * Sans. The logo, fonts and icons are in public/brand/.
 * Free of server imports.
 */

export const BRAND = {
  name: "Eduvia",
  /** The app's own name, in titles and emails. */
  appName: "Eduvia Marketing",
  /** The last line under every email. */
  footerLine: "Eduvia by Alif",
  bg: "#F5F7FC",
  paper: "#FFFFFF",
  paper2: "#EDF1FA",
  ink: "#141A5E",
  muted: "#545A80",
  line: "rgba(20, 26, 94, 0.82)",
  lineSoft: "rgba(20, 26, 94, 0.22)",
  rule: "rgba(20, 26, 94, 0.10)",
  gold: "#EBC35C",
  goldSoft: "rgba(235, 195, 92, 0.28)",
  sky: "#5EB4FF",
  accent: "#5EB4FF",
  /** Sky blue dark enough to read as text on white. */
  accentInk: "#1F63C6",
  accentSoft: "rgba(94, 180, 255, 0.14)",
  onInk: "#FFFFFF",
  display: `"Claston", "Plus Jakarta Sans", "Segoe UI", system-ui, sans-serif`,
  sans: `"Plus Jakarta Sans", "Segoe UI", system-ui, sans-serif`,
  mono: `"Geist Mono", ui-monospace, "SFMono-Regular", Menlo, monospace`,
} as const;

/** eduvia.my itself, where the forms live. */
export const SITE_URL = "https://eduvia.my";
export const SITE_HOST = "eduvia.my";

/** The logo files in public/brand/. */
export const LOGO = {
  /** On the app's own pages. */
  web: "/brand/eduvia-logo.svg",
  /** The logo is 3.89 times as wide as it is tall. */
  webWidth: 140,
  webHeight: 36,
  /** In emails: a PNG, since Gmail and Outlook don't show SVG. */
  email: "eduvia-logo-email.png",
  emailWidth: 117,
  emailHeight: 30,
} as const;

/** The @font-face rules for the brand fonts in public/brand/fonts/. */
export const BRAND_FONT_FACES = `@font-face { font-family: "Claston"; font-style: normal; font-weight: 400 800; font-display: swap; src: url("/brand/fonts/claston.woff2") format("woff2"); }
@font-face { font-family: "Plus Jakarta Sans"; font-style: normal; font-weight: 400 800; font-display: swap; src: url("/brand/fonts/plus-jakarta-sans.woff2") format("woff2"); }
@font-face { font-family: "Plus Jakarta Sans"; font-style: italic; font-weight: 600; font-display: swap; src: url("/brand/fonts/plus-jakarta-sans-italic-600.woff2") format("woff2"); }
@font-face { font-family: "Geist Mono"; font-style: normal; font-weight: 400 500; font-display: swap; src: url("/brand/fonts/geist-mono.woff2") format("woff2"); }`;

export function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** An absolute link to one of the brand files in public/brand/ (for emails). */
export function brandAsset(path: string): string {
  return `${appUrl()}/brand/${path}`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
