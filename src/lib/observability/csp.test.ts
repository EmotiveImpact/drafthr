/**
 * The app shell must run without 'unsafe-inline' scripts. Only the static
 * design mockups under public/*.html (which carry inline demo scripts and no
 * user data) keep it, on their own header rule.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../../..");
const vercel = JSON.parse(readFileSync(path.join(root, "vercel.json"), "utf8")) as {
  headers: { source: string; headers: { key: string; value: string }[] }[];
};

function cspFor(source: string): string {
  const rule = vercel.headers.find((h) => h.source === source);
  const csp = rule?.headers.find((h) => h.key === "Content-Security-Policy")?.value;
  if (!csp) throw new Error(`no CSP for ${source}`);
  return csp;
}

function scriptSrc(csp: string): string {
  return csp.split(";").map((d) => d.trim()).find((d) => d.startsWith("script-src")) ?? "";
}

function matches(source: string, url: string): boolean {
  // Vercel sources are path-to-regexp; these use only plain regex groups.
  return new RegExp(`^${source}$`).test(url);
}

describe("Content-Security-Policy", () => {
  it("serves the app shell and API without 'unsafe-inline' scripts", () => {
    expect(scriptSrc(cspFor("/((?!.*\\.html$).*)"))).toBe("script-src 'self'");
    expect(scriptSrc(cspFor("/index.html"))).toBe("script-src 'self'");
  });

  it("applies exactly one CSP rule to each path", () => {
    const cspRules = vercel.headers.filter((h) => h.headers.some((x) => x.key === "Content-Security-Policy"));
    for (const url of ["/", "/drafts/abc", "/api/draft", "/index.html", "/editor-designs.html", "/mockups/a.html"]) {
      expect(cspRules.filter((r) => matches(r.source, url)), url).toHaveLength(1);
    }
    const mockupRule = cspRules.find((r) => matches(r.source, "/editor-designs.html"))!;
    expect(matches(mockupRule.source, "/index.html")).toBe(false);
  });

  it("index.html has no inline scripts", () => {
    const html = readFileSync(path.join(root, "index.html"), "utf8");
    const scripts = Array.from(html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi));
    for (const [, attrs, body] of scripts) {
      expect(attrs).toMatch(/\ssrc=/);
      expect(body.trim()).toBe("");
    }
  });
});
