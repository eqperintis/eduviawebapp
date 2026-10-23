/**
 * UTM tags: the labels on a link that say where a visitor came from
 * (eduvia.my/enquire?utm_source=facebook&utm_campaign=holiday_camp). The
 * site's /utm.js copies them into hidden form fields, so they arrive like any
 * other answer and are learned as fields: they show on submissions, in the
 * CSV, in conditions, in Sheets columns and as {{utm_source}}. Free of
 * server imports so the builder UI can use the labels too.
 */

export const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

export const UTM_LABELS: Record<(typeof UTM_KEYS)[number], string> = {
  utm_source: "UTM source (e.g. facebook)",
  utm_medium: "UTM medium (e.g. paid)",
  utm_campaign: "UTM campaign",
  utm_content: "UTM content (which ad or link)",
  utm_term: "UTM term (search keyword)",
};

/** Where conditions list the UTM fields. */
export const UTM_FIELD_GROUP = "Where they came from (UTM)";

export function isUtmKey(key: string): key is (typeof UTM_KEYS)[number] {
  return (UTM_KEYS as readonly string[]).includes(key);
}

/** The UTM tags in a page address, e.g. the Referer of a submission. Empty for junk. */
export function utmFromUrl(url: string | null | undefined): Partial<Record<(typeof UTM_KEYS)[number], string>> {
  if (!url) return {};
  let params: URLSearchParams;
  try {
    params = new URL(url).searchParams;
  } catch {
    return {};
  }
  const found: Partial<Record<(typeof UTM_KEYS)[number], string>> = {};
  for (const key of UTM_KEYS) {
    const value = params.get(key)?.trim();
    if (value) found[key] = value.slice(0, 200);
  }
  return found;
}

/**
 * Fills in UTM tags the form didn't send from the page it was sent from.
 * Browsers usually send only the site's address with a cross-site submit,
 * so this rarely finds anything; the script is what makes UTM reliable.
 * What the form sent always wins.
 */
export function withUtmFromReferrer(data: Record<string, unknown>, referrer: string | null | undefined): Record<string, unknown> {
  const fromPage = utmFromUrl(referrer);
  const missing = Object.entries(fromPage).filter(([key]) => !(key in data) || data[key] === "");
  return missing.length ? { ...data, ...Object.fromEntries(missing) } : data;
}
