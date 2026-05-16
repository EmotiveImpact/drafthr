import { describe, expect, it } from "vitest";

import { PAGE_WIDTH_PX, pagedPageScaleForWidth } from "./printCss";

describe("pagedPageScaleForWidth", () => {
  it("keeps full-size pages when the column can fit A4", () => {
    expect(pagedPageScaleForWidth(PAGE_WIDTH_PX + 80)).toBe(1);
  });

  it("scales A4 pages to the available mobile column width", () => {
    const scale = pagedPageScaleForWidth(390);
    expect(scale).toBeGreaterThan(0.47);
    expect(scale).toBeLessThan(0.49);
  });

  it("falls back to full size for unmeasured containers", () => {
    expect(pagedPageScaleForWidth(0)).toBe(1);
    expect(pagedPageScaleForWidth(Number.NaN)).toBe(1);
  });
});
