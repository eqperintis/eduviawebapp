import { describe, expect, it } from "vitest";
import { hostAllowed, httpUrl, nextUrlAllowed, normalizeHost, pageUrlFromReferrer, parseDomainList, sourceHost } from "./origin";

describe("domains", () => {
  it("normalizes what people paste", () => {
    expect(normalizeHost("https://www.Eduvia.my/apply?x=1")).toBe("eduvia.my");
    expect(normalizeHost("eduvia.my:443")).toBe("eduvia.my");
    expect(parseDomainList("eduvia.my, https://sekool.my\n\n")).toEqual(["eduvia.my", "sekool.my"]);
  });

  it("allows subdomains but not look-alikes", () => {
    const allowed = ["eduvia.my"];
    expect(hostAllowed("eduvia.my", allowed)).toBe(true);
    expect(hostAllowed("blog.eduvia.my", allowed)).toBe(true);
    expect(hostAllowed("evileduvia.my", allowed)).toBe(false);
    expect(hostAllowed("eduvia.my.evil.io", allowed)).toBe(false);
    expect(hostAllowed("", allowed)).toBe(false);
  });

  it("reads the source page from Origin, then Referer", () => {
    expect(sourceHost(new Headers({ origin: "https://www.eduvia.my" }))).toBe("eduvia.my");
    expect(sourceHost(new Headers({ referer: "https://eduvia.my/apply" }))).toBe("eduvia.my");
    expect(sourceHost(new Headers({ origin: "null" }))).toBe("");
  });
});

describe("redirect safety", () => {
  it("only takes absolute http(s) links", () => {
    expect(httpUrl("javascript:alert(1)")).toBeNull();
    expect(httpUrl("/relative")).toBeNull();
    expect(httpUrl("https://eduvia.my/x")?.host).toBe("eduvia.my");
  });

  it("keeps _next on the form's own site", () => {
    expect(nextUrlAllowed("https://eduvia.my/thanks", ["eduvia.my"], "")).toBe("https://eduvia.my/thanks");
    expect(nextUrlAllowed("https://evil.io/", ["eduvia.my"], "eduvia.my")).toBeNull();
    expect(nextUrlAllowed("https://eduvia.my/t", [], "eduvia.my")).toBe("https://eduvia.my/t");
    expect(nextUrlAllowed("https://evil.io/", [], "eduvia.my")).toBeNull();
    expect(nextUrlAllowed("https://evil.io/", [], "")).toBeNull();
  });
});

describe("page from referrer", () => {
  it("keeps the page, drops the query and hash", () => {
    expect(pageUrlFromReferrer("https://eduvia.my/apply?utm=x#form")).toBe("https://eduvia.my/apply");
    expect(pageUrlFromReferrer("https://eduvia.my/")).toBe("https://eduvia.my/");
    expect(pageUrlFromReferrer("javascript:alert(1)")).toBeNull();
    expect(pageUrlFromReferrer("")).toBeNull();
  });
});
