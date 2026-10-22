import { describe, expect, it } from "vitest";
import { normalizeIp, pickClientIp } from "./client-ip";

const headers = (h: Record<string, string>) => ({ get: (n: string) => h[n.toLowerCase()] ?? null });

describe("pickClientIp", () => {
  it("trusts X-Real-IP over anything the visitor put in X-Forwarded-For", () => {
    expect(pickClientIp(headers({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "1.2.3.4, 203.0.113.7" }))).toBe("203.0.113.7");
  });

  it("falls back to the LAST forwarded entry (the one the edge appended), never the first", () => {
    expect(pickClientIp(headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8, 203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("returns unknown when there is nothing to go on", () => {
    expect(pickClientIp(headers({}))).toBe("unknown");
  });
});

describe("normalizeIp", () => {
  it("leaves IPv4 alone and unwraps IPv4-in-IPv6", () => {
    expect(normalizeIp("203.0.113.7")).toBe("203.0.113.7");
    expect(normalizeIp("::ffff:203.0.113.7")).toBe("203.0.113.7");
  });

  it("reduces IPv6 to its /64 so rotating addresses inside one network doesn't dodge a limit", () => {
    const a = normalizeIp("2001:f40:9a4:9677:81fb:7d2e:9445:c8b0");
    const b = normalizeIp("2001:0f40:09a4:9677:0000:0000:0000:0001");
    expect(a).toBe("2001:0f40:09a4:9677::/64");
    expect(b).toBe(a);
    expect(normalizeIp("2001:db8::1")).toBe("2001:0db8:0000:0000::/64");
  });

  it("does not throw on junk", () => {
    expect(normalizeIp("not an ip:::::")).toBe("unknown");
    expect(normalizeIp("")).toBe("unknown");
  });
});
