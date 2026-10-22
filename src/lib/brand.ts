/**
 * The Quolume brand, as on quolume.com: a sketchbook page. Paper background
 * with a faint grain, white cards outlined in wobbly pencil lines, near-black
 * ink for text and buttons, and indigo used only as the "pen" for labels,
 * highlights and scribbles. No glows or gradients. The logo, fonts and pencil
 * card outlines are the site's own files, copied into public/brand/.
 * Free of server imports.
 */

export const BRAND = {
  name: "Quolume",
  bg: "#F7F8F5",
  paper: "#FFFFFF",
  paper2: "#EFEFEA",
  ink: "#222222",
  muted: "#5F5D5A",
  line: "rgba(34, 34, 34, 0.82)",
  lineSoft: "rgba(34, 34, 34, 0.32)",
  rule: "rgba(34, 34, 34, 0.14)",
  accent: "#4F46E5",
  accentInk: "#4338CA",
  accentSoft: "rgba(79, 70, 229, 0.10)",
  onInk: "#F7F8F5",
  sans: `"Plus Jakarta Sans", "Segoe UI", system-ui, sans-serif`,
  mono: `"Geist Mono", ui-monospace, "SFMono-Regular", Menlo, monospace`,
} as const;

/** quolume.com itself, where the pencil card outlines also live. */
export const SITE_URL = "https://quolume.com";

export function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** An absolute link to one of the brand files in public/brand/ (for emails). */
export function brandAsset(path: string): string {
  return `${appUrl()}/brand/${path}`;
}

/** The paper grain from quolume.com, as a CSS background-image value. */
export const PAPER_GRAIN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 .2 0 0 0 -.07'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)'/%3E%3C/svg%3E")`;

/**
 * The SVG filters that turn a straight line into a pencil stroke (from
 * quolume.com). Put once in <body>; CSS uses filter: url(#rough) etc.
 */
export const PENCIL_FILTERS = `<svg class="filters" aria-hidden="true" focusable="false" style="position:absolute;width:0;height:0;overflow:hidden">
<filter id="rough" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="0.022" numOctaves="3" seed="3" result="warp"/><feDisplacementMap in="SourceGraphic" in2="warp" scale="5" xChannelSelector="R" yChannelSelector="G" result="wobbly"/><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="1" seed="9" result="grain"/><feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  2.6 0 0 0 -0.45" result="mask"/><feComposite in="wobbly" in2="mask" operator="in"/></filter>
<filter id="rough-line" x="-30%" y="-40%" width="160%" height="180%"><feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="3" seed="5" result="warp"/><feDisplacementMap in="SourceGraphic" in2="warp" scale="3" xChannelSelector="R" yChannelSelector="G" result="wobbly"/><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="1" seed="9" result="grain"/><feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  2.6 0 0 0 -0.45" result="mask"/><feComposite in="wobbly" in2="mask" operator="in"/></filter>
</svg>`;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
