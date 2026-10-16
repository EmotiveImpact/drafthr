import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { warning } = vi.hoisted(() => ({ warning: vi.fn() }));
vi.mock("sonner", () => ({ toast: { warning } }));

import { tryServerPdf } from "./pdf";

function respond(status: number) {
  const fetchMock = vi.fn(async () => new Response(status === 200 ? "%PDF" : "{}", { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("server PDF fallback", () => {
  beforeEach(() => {
    vi.stubEnv("DEV", false);
    warning.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("uses the server PDF when it renders", async () => {
    respond(200);
    const blob = await tryServerPdf("<p>x</p>", "x.pdf", "d1");
    expect(blob).not.toBeNull();
    expect(warning).not.toHaveBeenCalled();
  });

  it("falls back, and says why, when the letter is too large for the server request limit", async () => {
    // A letter with a few photo exhibits is over the platform's 4.5 MB body
    // limit. Blocking left no way to get a PDF at all.
    respond(413);
    await expect(tryServerPdf("<p>x</p>", "x.pdf", "d1")).resolves.toBeNull();
    expect(warning).toHaveBeenCalledWith(
      "Exported with the basic PDF renderer",
      expect.objectContaining({ description: expect.stringMatching(/too large for the server renderer/) }),
    );
  });

  it("falls back when the server is unavailable", async () => {
    respond(500);
    await expect(tryServerPdf("<p>x</p>", "x.pdf", "d1")).resolves.toBeNull();
    expect(warning).toHaveBeenCalledWith(
      "Exported with the basic PDF renderer",
      expect.objectContaining({ description: expect.stringMatching(/unavailable/) }),
    );
  });

  it("does not paper over an expired session or rate limit", async () => {
    respond(401);
    await expect(tryServerPdf("<p>x</p>", "x.pdf", "d1")).rejects.toThrow(/session has expired/);
    respond(429);
    await expect(tryServerPdf("<p>x</p>", "x.pdf", "d1")).rejects.toThrow(/Too many exports/);
    expect(warning).not.toHaveBeenCalled();
  });
});
