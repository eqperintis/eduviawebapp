import { BRAND, PAPER_GRAIN, PENCIL_FILTERS, SITE_URL, escapeHtml } from "@/lib/brand";

/**
 * The few pages a quolume.com visitor can land on here: the hosted
 * thank-you page and the error page, for plain HTML form posts. Built as
 * strings in quolume.com's own sketchbook look so they read as part of the
 * site, not as this app.
 */

export const BRAND_FONT_FACES = `@font-face { font-family: "Plus Jakarta Sans"; font-style: normal; font-weight: 400 800; font-display: swap; src: url("/brand/fonts/plus-jakarta-sans.woff2") format("woff2"); }
@font-face { font-family: "Plus Jakarta Sans"; font-style: italic; font-weight: 600; font-display: swap; src: url("/brand/fonts/plus-jakarta-sans-italic-600.woff2") format("woff2"); }
@font-face { font-family: "Geist Mono"; font-style: normal; font-weight: 400 500; font-display: swap; src: url("/brand/fonts/geist-mono.woff2") format("woff2"); }`;

export function brandPage(args: {
  title: string;
  message: string;
  /** A "back" link, usually the page the form was on. */
  backUrl?: string | null;
  backLabel?: string;
}): string {
  const back = args.backUrl
    ? `<a class="btn" href="${escapeHtml(args.backUrl)}">${escapeHtml(args.backLabel ?? "Go back")} <span class="arr" aria-hidden="true">→</span></a>`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(args.title)} · Quolume</title>
<link rel="icon" type="image/png" href="/brand/favicon.png?v=2">
<link rel="preload" href="/brand/fonts/plus-jakarta-sans.woff2" as="font" type="font/woff2" crossorigin>
<style>
${BRAND_FONT_FACES}
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; display: grid; place-items: center; align-content: center; gap: 28px; padding: 32px 16px;
  background: ${BRAND.bg} ${PAPER_GRAIN}; color: ${BRAND.ink}; font: 400 16px/1.6 ${BRAND.sans}; -webkit-font-smoothing: antialiased; }
.logo img { display: block; height: 40px; width: auto; }
.card { position: relative; width: min(560px, 100%); background: ${BRAND.paper}; border-radius: 16px; padding: clamp(26px, 5vw, 40px); display: grid; gap: 14px; }
.card::after { content: ""; position: absolute; inset: 0; pointer-events: none; border: 28px solid transparent;
  border-image: url("/brand/sketch-card-accent.webp") 80 / 40px / 12px round; }
.label { font: 500 13px/1.2 ${BRAND.mono}; text-transform: uppercase; letter-spacing: 0.1em; color: ${BRAND.accentInk}; margin: 0; }
h1 { margin: 0; font: 700 clamp(2rem, 6vw, 3.1rem)/1 ${BRAND.sans}; letter-spacing: -0.045em; text-wrap: balance; }
p { margin: 0; color: ${BRAND.muted}; font-size: 1.1rem; white-space: pre-line; }
.btn { position: relative; justify-self: start; display: inline-flex; gap: .6em; align-items: center; margin-top: 8px; text-decoration: none;
  background: ${BRAND.ink}; color: ${BRAND.onInk}; font: 600 16px/1 ${BRAND.sans}; padding: 1.05em 1.6em; border-radius: 14px; transition: transform .15s ease; }
.btn::after { content: ""; position: absolute; inset: -5px -4px -4px -5px; pointer-events: none; border: 1.4px solid ${BRAND.line}; border-radius: 17px; filter: url(#rough); transition: transform .15s ease; }
.btn:hover { transform: translate(-1px, -1px); } .btn:hover::after { transform: translate(2px, 2px); }
.btn .arr { font-family: ${BRAND.mono}; }
</style>
</head>
<body>
${PENCIL_FILTERS}
<a class="logo" href="${SITE_URL}" aria-label="Quolume home"><img src="/brand/quolume-logo-horizontal.webp" alt="Quolume" width="176" height="40"></a>
<main class="card">
<h1>${escapeHtml(args.title)}</h1>
${args.message ? `<p>${escapeHtml(args.message)}</p>` : ""}
${back}
</main>
</body>
</html>`;
}
