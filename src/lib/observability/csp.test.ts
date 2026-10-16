/**
 * The app shell must run without 'unsafe-inline' scripts. Only the static
 * design mockups under public/*.html (which carry inline demo scripts and no
 * user data) keep it, on their own header rule.
 *
 * connect-src must also cover every host the browser fetches: the DOCX export
 * fetches letterhead and signature images from Vercel Blob, and Sentry may
 * ingest in the US or EU region.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { VERCEL_BLOB_PUBLIC_HOST_SUFFIX } from "@/lib/storage/inlineImagesForExport";

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

function directive(csp: string, name: string): string[] {
  const found = csp.split(";").map((d) => d.trim()).find((d) => d.split(/\s+/)[0] === name);
  return found ? found.split(/\s+/).slice(1) : [];
}

/** CSP host-source matching for the https sources these policies use. */
function connectAllows(csp: string, url: string): boolean {
  const u = new URL(url);
  return directive(csp, "connect-src").some((src) => {
    if (src === "'self'") return false; // never a cross-origin host here
    const m = /^https:\/\/(\*\.)?([^/:]+)$/.exec(src);
    if (!m || u.protocol !== "https:") return false;
    const [, wildcard, host] = m;
    return wildcard ? u.hostname.endsWith(`.${host}`) : u.hostname === host;
  });
}

const APP_RULES = ["/((?!.*\\.html$).*)", "/index.html"];

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

  it("lets the browser fetch Vercel Blob images for the DOCX export", () => {
    expect(VERCEL_BLOB_PUBLIC_HOST_SUFFIX).toBe(".public.blob.vercel-storage.com");
    for (const source of APP_RULES) {
      const csp = cspFor(source);
      expect(directive(csp, "connect-src"), source).toContain(`https://*${VERCEL_BLOB_PUBLIC_HOST_SUFFIX}`);
      expect(connectAllows(csp, "https://abc123xyz.public.blob.vercel-storage.com/letterhead/a.png"), source).toBe(true);
      expect(connectAllows(csp, "https://evil.example.com/a.png"), source).toBe(false);
      expect(connectAllows(csp, "https://public.blob.vercel-storage.com.evil.test/a.png"), source).toBe(false);
    }
  });

  it("allows Sentry ingest in the US and EU regions and WorkOS", () => {
    for (const source of APP_RULES) {
      const csp = cspFor(source);
      for (const url of [
        "https://o1.ingest.sentry.io/api/1/envelope/",
        "https://o1.ingest.us.sentry.io/api/1/envelope/",
        "https://o1.ingest.de.sentry.io/api/1/envelope/",
        "https://api.workos.com/user_management/authenticate",
      ]) {
        expect(connectAllows(csp, url), `${source} ${url}`).toBe(true);
      }
    }
  });

  it("keeps the static mockups on connect-src 'self'", () => {
    expect(directive(cspFor("/((?!index\\.html$).*\\.html)"), "connect-src")).toEqual(["'self'"]);
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
