/**
 * Which sites may post to a form, and where a visitor may be sent after.
 * Free of server imports so it can be unit tested.
 */

/** "https://www.Quolume.com/apply" → "quolume.com". Returns "" for junk. */
export function normalizeHost(input: string): string {
  let value = input.trim().toLowerCase();
  if (!value) return "";
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  value = value.split(/[/?#]/)[0] ?? "";
  value = value.replace(/:\d+$/, "").replace(/^www\./, "").replace(/\.$/, "");
  return /^[a-z0-9.-]+$/.test(value) ? value : "";
}

export function parseDomainList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return [...new Set(raw.split(/[\s,]+/).map(normalizeHost).filter(Boolean))];
}

/** True when `host` is one of `allowed`, or a subdomain of one. */
export function hostAllowed(host: string, allowed: string[]): boolean {
  const clean = normalizeHost(host);
  if (!clean) return false;
  return allowed.some((domain) => clean === domain || clean.endsWith(`.${domain}`));
}

/** The host of the page the submission came from, from Origin or Referer. */
export function sourceHost(headers: { get(name: string): string | null }): string {
  for (const name of ["origin", "referer"]) {
    const value = headers.get(name);
    if (!value || value === "null") continue;
    try {
      return normalizeHost(new URL(value).host);
    } catch {
      continue;
    }
  }
  return "";
}

/** An absolute http(s) URL, or null. Blocks javascript:, data: and relative paths. */
export function httpUrl(raw: string | null | undefined): URL | null {
  if (!raw) return null;
  try {
    const url = new URL(raw.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

/**
 * Whether a _next URL sent by the visitor's form may be followed. It must
 * point at one of the form's allowed domains, or, with no list set, at the
 * same site the form was posted from. Anything else would turn the endpoint
 * into an open redirect.
 */
export function nextUrlAllowed(next: string, allowed: string[], fromHost: string): string | null {
  const url = httpUrl(next);
  if (!url) return null;
  const host = normalizeHost(url.host);
  if (allowed.length > 0) return hostAllowed(host, allowed) ? url.toString() : null;
  return fromHost && host === fromHost ? url.toString() : null;
}

/** The page a submission came from, without its query or #hash: "https://quolume.com/apply". Null for junk. */
export function pageUrlFromReferrer(referrer: string | null | undefined): string | null {
  const url = httpUrl(referrer);
  if (!url || !normalizeHost(url.host)) return null;
  url.search = "";
  url.hash = "";
  const text = url.toString();
  return text.length <= 500 ? text : null;
}
