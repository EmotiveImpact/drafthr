import { describe, it, expect } from "vitest";
import { evidenceFileName } from "@/lib/export/pack";
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

const PNG_DATA_URL = "data:image/png;base64,iVBORw0KGgo=";

describe("evidenceFileName — extension handling", () => {
  it("does not double an UPPERCASE extension that already matches the mime", () => {
    const item = ev({ id: "a", filename: "Photo.PNG", fileDataUrl: PNG_DATA_URL });
    // Regression: was "01-Photo.PNG.png".
    expect(evidenceFileName(item, 0)).toBe("01-Photo.PNG");
  });

  it("does not double a mixed-case extension", () => {
    const item = ev({ id: "b", filename: "Scan.Png", fileDataUrl: PNG_DATA_URL });
    expect(evidenceFileName(item, 1)).toBe("02-Scan.Png");
  });

  it("still appends the extension when the filename has none", () => {
    const item = ev({ id: "c", filename: "evidence", fileDataUrl: PNG_DATA_URL });
    expect(evidenceFileName(item, 2)).toBe("03-evidence.png");
  });

  it("leaves a correct lowercase extension untouched", () => {
    const item = ev({ id: "d", filename: "photo.png", fileDataUrl: PNG_DATA_URL });
    expect(evidenceFileName(item, 0)).toBe("01-photo.png");
  });

  it("does not double an uppercase .TXT on a note-only item", () => {
    const item = ev({ id: "e", filename: "Notes.TXT" });
    expect(evidenceFileName(item, 0)).toBe("01-Notes.TXT");
  });
});
