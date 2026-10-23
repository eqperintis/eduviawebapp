/**
 * Where a visitor came from. Two kinds of fields, both added to the form by
 * the site's /utm.js and saved like any other answer, so they show on
 * submissions, in the CSV, in conditions, in Sheets columns and as
 * {{utm_source}} / {{came_from}}:
 *
 * - UTM tags: labels the owner puts on the links they share
 *   (eduvia.my/enquire?utm_source=facebook&utm_campaign=holiday_camp).
 *   The tracking-link maker on the Integration tab writes them.
 * - came_from: worked out by the script with nothing to set up, from the
 *   site the visitor clicked through from ("Google search", "Instagram",
 *   "Direct"...).
 *
 * Free of server imports so the builder UI can use it too.
 */

export const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;
export type UtmKey = (typeof UTM_KEYS)[number];

/** The field /utm.js fills in by itself. */
export const CAME_FROM_KEY = "came_from";

const TRACKING_KEYS: readonly string[] = [CAME_FROM_KEY, ...UTM_KEYS];

const TRACKING_LABELS: Record<string, string> = {
  came_from: "Came from (website)",
  utm_source: "UTM source (e.g. facebook)",
  utm_medium: "UTM medium (e.g. paid)",
  utm_campaign: "UTM campaign",
  utm_content: "UTM content (which ad or post)",
  utm_term: "UTM term (search keyword)",
};

/** Where conditions list these fields. */
export const TRACKING_FIELD_GROUP = "Where they came from";

/** UTM tags and came_from: filled in by the script, not typed by the person. */
export function isTrackingKey(key: string): boolean {
  return TRACKING_KEYS.includes(key);
}

export function trackingLabel(key: string): string | null {
  return TRACKING_LABELS[key] ?? null;
}

/** The UTM tags in a page address, e.g. the Referer of a submission. Empty for junk. */
export function utmFromUrl(url: string | null | undefined): Partial<Record<UtmKey, string>> {
  if (!url) return {};
  let params: URLSearchParams;
  try {
    params = new URL(url).searchParams;
  } catch {
    return {};
  }
  const found: Partial<Record<UtmKey, string>> = {};
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

/** Where a tracking link will be posted, and what kind of traffic that is when it isn't a paid ad. */
export const LINK_SOURCES = [
  { value: "facebook", label: "Facebook", medium: "social" },
  { value: "instagram", label: "Instagram", medium: "social" },
  { value: "tiktok", label: "TikTok", medium: "social" },
  { value: "youtube", label: "YouTube", medium: "social" },
  { value: "whatsapp", label: "WhatsApp", medium: "messaging" },
  { value: "telegram", label: "Telegram", medium: "messaging" },
  { value: "google", label: "Google", medium: "search" },
  { value: "email", label: "Email or newsletter", medium: "email" },
  { value: "flyer", label: "Flyer, poster or QR code", medium: "print" },
] as const;

/** "Holiday Camp 2026!" → "holiday_camp_2026": the same campaign always reads the same in reports. */
export function tagValue(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

export type LinkTags = { source: string; medium: string; campaign: string; content: string };

/** The four tags a tracking link carries, from the Links page's plain choices. Null without a source. */
export function linkTags(args: { source: string; paid: boolean; campaign: string; content?: string }): LinkTags | null {
  const source = tagValue(args.source);
  if (!source) return null;
  const known = LINK_SOURCES.find((entry) => entry.value === source);
  return {
    source,
    medium: args.paid ? "paid" : known?.medium ?? "referral",
    campaign: tagValue(args.campaign),
    content: tagValue(args.content ?? ""),
  };
}

/**
 * The page link with the tags on it. Keeps whatever the page link already
 * has (other parameters, #anchor). Null when the page link isn't a full web
 * address.
 */
export function linkUrl(page: string, tags: LinkTags): string | null {
  let url: URL;
  try {
    url = new URL(page.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  url.searchParams.set("utm_source", tags.source);
  url.searchParams.set("utm_medium", tags.medium);
  if (tags.campaign) url.searchParams.set("utm_campaign", tags.campaign);
  else url.searchParams.delete("utm_campaign");
  if (tags.content) url.searchParams.set("utm_content", tags.content);
  else url.searchParams.delete("utm_content");
  return url.toString();
}

/** linkTags then linkUrl, in one go. */
export function buildTrackingLink(args: {
  page: string;
  source: string;
  paid: boolean;
  campaign: string;
  content?: string;
}): string | null {
  const tags = linkTags(args);
  return tags ? linkUrl(args.page, tags) : null;
}

export type TrackingColumns = {
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmContent: string;
  cameFrom: string;
};

function column(value: unknown): string {
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === "string" || typeof first === "number" ? String(first).trim().slice(0, 191) : "";
}

/** A submission's tags, for its own columns: what the Links page counts by. */
export function trackingColumns(data: Record<string, unknown>): TrackingColumns {
  return {
    utmSource: column(data.utm_source),
    utmMedium: column(data.utm_medium),
    utmCampaign: column(data.utm_campaign),
    utmContent: column(data.utm_content),
    cameFrom: column(data[CAME_FROM_KEY]),
  };
}

/** "facebook" → "Facebook"; a place typed by hand shows as typed. */
export function sourceLabel(source: string): string {
  return LINK_SOURCES.find((entry) => entry.value === source)?.label ?? source;
}
