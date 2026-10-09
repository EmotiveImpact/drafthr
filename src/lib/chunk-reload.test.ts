import { beforeEach, describe, expect, it, vi } from "vitest";
import { isChunkLoadError, reloadForStaleChunk, resetChunkReloadForTests } from "./chunk-reload";

function fakeWindow(store: Record<string, string> = {}) {
  return {
    location: { reload: vi.fn() },
    sessionStorage: {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
    },
  };
}

describe("isChunkLoadError", () => {
  it("recognises the dynamic import failures each browser reports", () => {
    for (const message of [
      "Failed to fetch dynamically imported module: https://app.example/assets/Settings-abc.js",
      "error loading dynamically imported module: https://app.example/assets/Editor-abc.js",
      "Importing a module script failed.",
      "'text/html' is not a valid JavaScript MIME type.",
      "Unable to preload CSS for /assets/Editor-abc.css",
    ]) {
      expect(isChunkLoadError(new TypeError(message)), message).toBe(true);
    }
  });

  it("ignores ordinary errors", () => {
    expect(isChunkLoadError(new Error("Cannot read properties of undefined"))).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
  });
});

describe("reloadForStaleChunk", () => {
  beforeEach(() => resetChunkReloadForTests());

  it("reloads once, then refuses within the cooldown so a missing chunk cannot loop", () => {
    const store: Record<string, string> = {};
    const first = fakeWindow(store);
    expect(reloadForStaleChunk(first, 1_000_000)).toBe(true);
    expect(first.location.reload).toHaveBeenCalledTimes(1);

    // The reloaded page hits the same failure straight away.
    resetChunkReloadForTests();
    const second = fakeWindow(store);
    expect(reloadForStaleChunk(second, 1_005_000)).toBe(false);
    expect(second.location.reload).not.toHaveBeenCalled();

    // A later deploy can reload again.
    expect(reloadForStaleChunk(second, 1_000_000 + 120_000)).toBe(true);
  });

  it("does not reload while offline, where a reload would lose the app", () => {
    const win = { ...fakeWindow(), navigator: { onLine: false } };
    expect(reloadForStaleChunk(win)).toBe(false);
    expect(win.location.reload).not.toHaveBeenCalled();
  });

  it("does not reload when sessionStorage is unavailable", () => {
    const win = fakeWindow();
    win.sessionStorage.getItem = () => {
      throw new Error("blocked");
    };
    expect(reloadForStaleChunk(win)).toBe(false);
    expect(win.location.reload).not.toHaveBeenCalled();
  });
});
