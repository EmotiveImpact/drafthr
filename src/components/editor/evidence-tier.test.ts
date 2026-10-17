import { describe, expect, it } from "vitest";
import type { Draft } from "@/lib/letters/types";
import { evidenceUsage } from "./evidence-tier";

const ev = (id: string, sectionIds?: string[]) => ({ id, kind: "document" as const, filename: `${id}.pdf`, content: "", uploadedAt: 0, includeVerbatim: false, sectionIds });

describe("evidenceUsage", () => {
  const sections = [
    { id: "s1", html: '<p>As the record shows <span data-att-id="cited"></span></p>' },
    { id: "s2", html: "<p>No citations here.</p>" },
  ] as Draft["sections"];

  it("counts evidence cited in the text or linked to a section as used (LETTER-X46)", () => {
    const { used, unused } = evidenceUsage({
      sections,
      evidence: [ev("cited"), ev("linked", ["s2"]), ev("loose"), ev("stale", ["gone"])],
    });
    expect(used.map((e) => e.id)).toEqual(["cited", "linked"]);
    expect(unused.map((e) => e.id)).toEqual(["loose", "stale"]);
  });

  it("has nothing unused when there is no evidence", () => {
    expect(evidenceUsage({ sections, evidence: undefined })).toEqual({ used: [], unused: [] });
  });
});
