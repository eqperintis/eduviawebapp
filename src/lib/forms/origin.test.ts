import { describe, expect, it } from "vitest";
import { hostAllowed, httpUrl, nextUrlAllowed, normalizeHost, pageUrlFromReferrer, parseDomainList, sourceHost } from "./origin";

describe("domains", () => {
  it("normalizes what people paste", () => {
    expect(normalizeHost("https://www.Quolume.com/apply?x=1")).toBe("quolume.com");
    expect(normalizeHost("quolume.com:443")).toBe("quolume.com");
    expect(parseDomainList("quolume.com, https://sekool.my\n\n")).toEqual(["quolume.com", "sekool.my"]);
  });

  it("allows subdomains but not look-alikes", () => {
    const allowed = ["quolume.com"];
    expect(hostAllowed("quolume.com", allowed)).toBe(true);
    expect(hostAllowed("blog.quolume.com", allowed)).toBe(true);
    expect(hostAllowed("evilquolume.com", allowed)).toBe(false);
    expect(hostAllowed("quolume.com.evil.io", allowed)).toBe(false);
    expect(hostAllowed("", allowed)).toBe(false);
  });

  it("reads the source page from Origin, then Referer", () => {
    expect(sourceHost(new Headers({ origin: "https://www.quolume.com" }))).toBe("quolume.com");
    expect(sourceHost(new Headers({ referer: "https://quolume.com/apply" }))).toBe("quolume.com");
    expect(sourceHost(new Headers({ origin: "null" }))).toBe("");
  });
});

describe("redirect safety", () => {
  it("only takes absolute http(s) links", () => {
    expect(httpUrl("javascript:alert(1)")).toBeNull();
    expect(httpUrl("/relative")).toBeNull();
    expect(httpUrl("https://quolume.com/x")?.host).toBe("quolume.com");
  });

  it("keeps _next on the form's own site", () => {
    expect(nextUrlAllowed("https://quolume.com/thanks", ["quolume.com"], "")).toBe("https://quolume.com/thanks");
    expect(nextUrlAllowed("https://evil.io/", ["quolume.com"], "quolume.com")).toBeNull();
    expect(nextUrlAllowed("https://quolume.com/t", [], "quolume.com")).toBe("https://quolume.com/t");
    expect(nextUrlAllowed("https://evil.io/", [], "quolume.com")).toBeNull();
    expect(nextUrlAllowed("https://evil.io/", [], "")).toBeNull();
  });
});

describe("page from referrer", () => {
  it("keeps the page, drops the query and hash", () => {
    expect(pageUrlFromReferrer("https://quolume.com/apply?utm=x#form")).toBe("https://quolume.com/apply");
    expect(pageUrlFromReferrer("https://quolume.com/")).toBe("https://quolume.com/");
    expect(pageUrlFromReferrer("javascript:alert(1)")).toBeNull();
    expect(pageUrlFromReferrer("")).toBeNull();
  });
});
