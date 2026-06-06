import { describe, expect, it } from "vitest";
import { figureLabelFor, validFigureNumbers } from "@/lib/evidence";
import type { EvidenceItem } from "@/lib/letters/types";

function ev(partial: Partial<EvidenceItem> & { id: string }): EvidenceItem {
  return {
    kind: "document",
    content: "",
    uploadedAt: 0,
    includeVerbatim: false,
    ...partial,
  };
}

describe("validFigureNumbers", () => {
  it("numbers figures among figure-mode items only, not all evidence", () => {
    // 4 evidence items, only 2 are figures -> valid figure refs are 1 and 2,
    // even though there are 4 attachments in total.
    const evidence: EvidenceItem[] = [
      ev({ id: "a", displayMode: "figure" }),
      ev({ id: "b", displayMode: "attached" }),
      ev({ id: "c", displayMode: "figure" }),
      ev({ id: "d", displayMode: "pack_only" }),
    ];
    const valid = validFigureNumbers(evidence);
    expect([...valid].sort()).toEqual([1, 2]);
    // The regression we fixed: "Fig 4" must NOT be considered valid just
    // because there are 4 evidence items total.
    expect(valid.has(4)).toBe(false);
    expect(valid.has(3)).toBe(false);
  });

  it("treats a missing displayMode as a figure (default)", () => {
    const evidence: EvidenceItem[] = [ev({ id: "a" }), ev({ id: "b" })];
    expect([...validFigureNumbers(evidence)].sort()).toEqual([1, 2]);
  });

  it("honors custom numeric figureLabel overrides", () => {
    const evidence: EvidenceItem[] = [
      ev({ id: "a", displayMode: "figure", figureLabel: "Fig 7" }),
      ev({ id: "b", displayMode: "figure" }),
    ];
    const valid = validFigureNumbers(evidence);
    // Custom label "Fig 7" makes 7 valid; the auto-numbered second figure is 2.
    expect(valid.has(7)).toBe(true);
    expect(valid.has(2)).toBe(true);
  });

  it("returns an empty set when there are no figures", () => {
    const evidence: EvidenceItem[] = [
      ev({ id: "a", displayMode: "attached" }),
      ev({ id: "b", displayMode: "pack_only" }),
    ];
    expect(validFigureNumbers(evidence).size).toBe(0);
  });

  it("stays consistent with figureLabelFor", () => {
    const evidence: EvidenceItem[] = [
      ev({ id: "a", displayMode: "figure" }),
      ev({ id: "b", displayMode: "inline" }),
      ev({ id: "c", displayMode: "figure" }),
    ];
    const valid = validFigureNumbers(evidence);
    for (const item of evidence) {
      const label = figureLabelFor(item, evidence);
      const m = label.match(/(\d+)/);
      if (m) expect(valid.has(Number(m[1]))).toBe(true);
    }
  });
});
