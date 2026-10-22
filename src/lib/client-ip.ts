/**
 * Works out who a visitor is for rate limiting. Hostinger's edge sets
 * X-Real-IP itself and ignores a value sent by the visitor, but it APPENDS to
 * X-Forwarded-For — so the first X-Forwarded-For entry is whatever the visitor
 * typed and must never be trusted. (Checked live: a made-up X-Forwarded-For
 * came through as the first entry; a made-up X-Real-IP was ignored.)
 */
type HeaderReader = { get(name: string): string | null };

function expandIpv6(ip: string): string[] | null {
  const halves = ip.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? head.length !== 8 : missing < 0) return null;
  const parts = halves.length === 1 ? head : [...head, ...Array<string>(missing).fill("0"), ...tail];
  if (!parts.every((p) => /^[0-9a-f]{1,4}$/i.test(p))) return null;
  return parts.map((p) => p.toLowerCase().padStart(4, "0"));
}

/** IPv4 as is; IPv6 reduced to its /64 network, since one household or attacker controls every address inside it. */
export function normalizeIp(raw: string): string {
  let ip = raw.trim().replace(/^\[|\]$/g, "");
  const mapped = ip.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (mapped) ip = mapped[1]!;
  if (!ip.includes(":")) return ip || "unknown";
  const parts = expandIpv6(ip);
  return parts ? `${parts.slice(0, 4).join(":")}::/64` : "unknown";
}

export function pickClientIp(headers: HeaderReader): string {
  const real = headers.get("x-real-ip");
  if (real && real.trim()) return normalizeIp(real);
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const last = forwarded.split(",").map((s) => s.trim()).filter(Boolean).pop();
    if (last) return normalizeIp(last);
  }
  return "unknown";
}
