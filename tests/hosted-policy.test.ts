// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("hosted upload policy", () => {
  it("permits the installed Blob SDK upload API without allowing arbitrary connections", () => {
    const config = JSON.parse(readFileSync("vercel.json", "utf8"));
    const policy = config.headers[0].headers.find((header: { key: string }) => header.key === "Content-Security-Policy").value as string;
    const connect = policy.split(";").find(part => part.trim().startsWith("connect-src "))!.trim().split(/\s+/).slice(1);
    expect(connect).toContain("'self'");
    expect(connect).toContain("https://vercel.com/api/blob");
    expect(connect).toContain("https://vercel.com/api/blob/");
    expect(connect).not.toContain("*");
    expect(connect).not.toContain("https:");
    expect(connect).not.toContain("https://vercel.com");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
  });
});
