import { BRAND, BRAND_FONT_FACES, LOGO, SITE_URL, escapeHtml } from "@/lib/brand";

/**
 * The few pages an eduvia.my visitor can land on here: the hosted
 * thank-you page and the error page, for plain HTML form posts. Built as
 * strings in eduvia.my's own look so they read as part of the
 * site, not as this app.
 */

export function brandPage(args: {
  title: string;
  message: string;
  /** A "back" link, usually the page the form was on. */
  backUrl?: string | null;
  backLabel?: string;
}): string {
  const back = args.backUrl
    ? `<a class="btn" href="${escapeHtml(args.backUrl)}">${escapeHtml(args.backLabel ?? "Go back")} <span aria-hidden="true">→</span></a>`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(args.title)} · ${BRAND.name}</title>
<link rel="icon" type="image/png" href="/brand/favicon.png?v=3">
<link rel="preload" href="/brand/fonts/claston.woff2" as="font" type="font/woff2" crossorigin>
<style>
${BRAND_FONT_FACES}
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; display: grid; place-items: center; align-content: center; gap: 28px; padding: 32px 16px;
  background: ${BRAND.bg}; color: ${BRAND.ink}; font: 400 16px/1.6 ${BRAND.sans}; -webkit-font-smoothing: antialiased; }
.logo img { display: block; height: 40px; width: auto; }
.card { position: relative; width: min(560px, 100%); background: ${BRAND.paper}; border: 1px solid ${BRAND.rule}; border-radius: 22px;
  padding: clamp(26px, 5vw, 40px); display: grid; gap: 14px; box-shadow: 0 1px 2px rgba(20, 26, 94, 0.05), 0 12px 32px rgba(20, 26, 94, 0.08); overflow: hidden; }
.card::before { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 6px; background: ${BRAND.gold}; }
h1 { margin: 0; font: 400 clamp(2rem, 6vw, 2.8rem)/1.05 ${BRAND.display}; text-wrap: balance; }
p { margin: 0; color: ${BRAND.muted}; font-size: 1.05rem; white-space: pre-line; }
.btn { justify-self: start; display: inline-flex; gap: .6em; align-items: center; margin-top: 8px; text-decoration: none;
  background: ${BRAND.ink}; color: ${BRAND.onInk}; font: 600 16px/1 ${BRAND.sans}; padding: 1em 1.5em; border-radius: 999px; transition: background .15s ease; }
.btn:hover { background: #222A7A; }
.btn:focus-visible { outline: 3px solid ${BRAND.gold}; outline-offset: 3px; }
</style>
</head>
<body>
<a class="logo" href="${SITE_URL}" aria-label="${BRAND.name} home"><img src="${LOGO.web}" alt="${BRAND.name}" width="156" height="40"></a>
<main class="card">
<h1>${escapeHtml(args.title)}</h1>
${args.message ? `<p>${escapeHtml(args.message)}</p>` : ""}
${back}
</main>
</body>
</html>`;
}
