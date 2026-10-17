import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { StorageQuotaBanner } from "./StorageQuotaBanner";
import {
  _resetQuotaToast,
  ASSUMED_QUOTA_BYTES,
  createQuotaSafeStorage,
} from "@/lib/storage/quota-safe-storage";

describe("StorageQuotaBanner", () => {
  beforeEach(() => _resetQuotaToast());

  it("stays visible while storage is near quota and goes when it recovers", () => {
    let used = ASSUMED_QUOTA_BYTES * 0.95;
    const storage = createQuotaSafeStorage({ getItem: () => null, setItem: () => {}, removeItem: () => {} }, () => {}, {
      estimateUsage: () => used,
    });
    render(
      <StorageQuotaBanner />,
    );
    expect(screen.queryByTestId("storage-quota-banner")).toBeNull();

    act(() => storage.setItem("k", "{}"));
    expect(screen.getByTestId("storage-quota-banner").textContent).toMatch(/nearly full/);
    // A second write while still near quota keeps it up (no once-per-load).
    act(() => storage.setItem("k", "{}"));
    expect(screen.getByTestId("storage-quota-banner")).toBeTruthy();

    used = 1000;
    act(() => storage.setItem("k", "{}"));
    expect(screen.queryByTestId("storage-quota-banner")).toBeNull();
  });
});
