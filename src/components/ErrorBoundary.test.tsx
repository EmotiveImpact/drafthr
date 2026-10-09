import { lazy, Suspense } from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { reloadForStaleChunk } = vi.hoisted(() => ({ reloadForStaleChunk: vi.fn(() => true) }));
vi.mock("@/lib/chunk-reload", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/chunk-reload")>()),
  reloadForStaleChunk,
}));
vi.mock("@/lib/observability/sentry", () => ({ captureError: vi.fn() }));

import { ErrorBoundary } from "./ErrorBoundary";

function staleRoute() {
  return lazy(() =>
    Promise.reject(
      new TypeError("Failed to fetch dynamically imported module: https://app.example/assets/Settings-old.js"),
    ),
  );
}

function renderInBoundary(Child: React.ComponentType) {
  return render(
    <ErrorBoundary>
      <Suspense fallback={<p>loading</p>}>
        <Child />
      </Suspense>
    </ErrorBoundary>,
  );
}

describe("ErrorBoundary and stale chunks after a deploy", () => {
  beforeEach(() => {
    reloadForStaleChunk.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("reloads to the new build when a lazy route's chunk is gone, without the error card", async () => {
    reloadForStaleChunk.mockReturnValue(true);
    const Stale = staleRoute();
    renderInBoundary(Stale);
    expect(await screen.findByRole("status")).toHaveTextContent(/latest version/i);
    expect(reloadForStaleChunk).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/This page hit an error/)).not.toBeInTheDocument();
  });

  it("shows the error card when a reload was already tried", async () => {
    reloadForStaleChunk.mockReturnValue(false);
    const Stale = staleRoute();
    renderInBoundary(Stale);
    expect(await screen.findByText(/This page hit an error/)).toBeInTheDocument();
  });

  it("does not reload for ordinary render errors", async () => {
    function Broken(): React.ReactElement {
      throw new Error("boom");
    }
    renderInBoundary(Broken);
    expect(await screen.findByText(/This page hit an error/)).toBeInTheDocument();
    expect(reloadForStaleChunk).not.toHaveBeenCalled();
  });
});
