import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { layoutTableGrid, renderLetterDocxBlob } from "./docx";
import type { Draft } from "@/lib/letters/types";

const ONE_BY_ONE_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

async function renderParts(bodyHtml: string, opts: { letterhead?: boolean } = {}) {
  const blob = await renderLetterDocxBlob(makeDraft(bodyHtml, opts.letterhead ?? false));
  const zip = await JSZip.loadAsync(blob);
  const documentXml = await zip.file("word/document.xml")!.async("string");
  const relsXml = await zip.file("word/_rels/document.xml.rels")!.async("string");
  const doc = new DOMParser().parseFromString(documentXml, "application/xml");
  return { documentXml, relsXml, doc };
}

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

function paragraphs(doc: Document): Element[] {
  return Array.from(doc.getElementsByTagNameNS(W, "p"));
}

function textOf(el: Element): string {
  return Array.from(el.getElementsByTagNameNS(W, "t"))
    .map((t) => t.textContent)
    .join("");
}

describe("DOCX export formatting", () => {
  it("keeps each paragraph of a multi-paragraph blockquote separate and indented", async () => {
    const { doc } = await renderParts(
      `<blockquote><p>First quoted paragraph.</p><p>Second quoted paragraph.</p></blockquote>`,
    );
    const quoted = paragraphs(doc).filter((p) => /quoted paragraph/.test(textOf(p)));
    expect(quoted.map(textOf)).toEqual(["First quoted paragraph.", "Second quoted paragraph."]);
    for (const p of quoted) {
      const ind = p.getElementsByTagNameNS(W, "ind")[0];
      expect(ind?.getAttributeNS(W, "left") ?? ind?.getAttribute("w:left")).toBe("360");
      expect(p.getElementsByTagNameNS(W, "i").length).toBeGreaterThan(0);
    }
  });

  it("indents nested blockquotes further", async () => {
    const { doc } = await renderParts(
      `<blockquote><p>Outer</p><blockquote><p>Inner</p></blockquote></blockquote>`,
    );
    const inner = paragraphs(doc).find((p) => textOf(p) === "Inner")!;
    expect(inner.getElementsByTagNameNS(W, "ind")[0].getAttribute("w:left")).toBe("720");
  });

  it("centres the letterhead like the page view and PDF", async () => {
    const { doc } = await renderParts(`<p>Body</p>`, { letterhead: true });
    const first = paragraphs(doc).find((p) => p.getElementsByTagNameNS(W, "drawing").length > 0)!;
    expect(first).toBeTruthy();
    expect(first.getElementsByTagNameNS(W, "jc")[0]?.getAttribute("w:val")).toBe("center");
  });

  it("inherits text-align from a container onto its paragraphs", async () => {
    const { doc } = await renderParts(`<div style="text-align:center"><p>Centred</p><p style="text-align:right">Right</p></div>`);
    const centred = paragraphs(doc).find((p) => textOf(p) === "Centred")!;
    const right = paragraphs(doc).find((p) => textOf(p) === "Right")!;
    expect(centred.getElementsByTagNameNS(W, "jc")[0]?.getAttribute("w:val")).toBe("center");
    expect(right.getElementsByTagNameNS(W, "jc")[0]?.getAttribute("w:val")).toBe("right");
  });

  it("writes links as real hyperlinks with an external relationship", async () => {
    const { doc, relsXml } = await renderParts(
      `<p>See <a href="https://www.gov.uk/acas?x=1&amp;y=2">the ACAS guidance</a> and <a href="javascript:alert(1)">this</a>.</p>`,
    );
    const links = Array.from(doc.getElementsByTagNameNS(W, "hyperlink"));
    expect(links).toHaveLength(1);
    expect(textOf(links[0])).toBe("the ACAS guidance");
    const relId = links[0].getAttribute("r:id")!;
    const rels = new DOMParser().parseFromString(relsXml, "application/xml");
    const rel = Array.from(rels.getElementsByTagName("Relationship")).find((r) => r.getAttribute("Id") === relId)!;
    expect(rel.getAttribute("Target")).toBe("https://www.gov.uk/acas?x=1&y=2");
    expect(rel.getAttribute("TargetMode")).toBe("External");
    expect(rel.getAttribute("Type")).toMatch(/relationships\/hyperlink$/);
  });

  it("maps colspan to gridSpan and rowspan to vMerge so cells stay in their columns", async () => {
    const { doc } = await renderParts(
      `<table>
        <tr><th colspan="2">Period</th><th>Outcome</th></tr>
        <tr><td rowspan="2">Q1</td><td>Jan</td><td>Late</td></tr>
        <tr><td>Feb</td><td>On time</td></tr>
      </table>`,
    );
    const tbl = doc.getElementsByTagNameNS(W, "tbl")[0];
    expect(tbl.getElementsByTagNameNS(W, "gridCol")).toHaveLength(3);
    const rows = Array.from(tbl.getElementsByTagNameNS(W, "tr"));
    expect(rows).toHaveLength(3);
    const cells = rows.map((r) => Array.from(r.getElementsByTagNameNS(W, "tc")));
    // Row 1: one cell spanning two grid columns, then Outcome.
    expect(cells[0]).toHaveLength(2);
    expect(cells[0][0].getElementsByTagNameNS(W, "gridSpan")[0].getAttribute("w:val")).toBe("2");
    // Row 2: Q1 starts a vertical merge.
    expect(cells[1].map(textOf)).toEqual(["Q1", "Jan", "Late"]);
    expect(cells[1][0].getElementsByTagNameNS(W, "vMerge")[0].getAttribute("w:val")).toBe("restart");
    // Row 3: a continuation cell holds column 1, so Feb lands in column 2.
    expect(cells[2]).toHaveLength(3);
    const cont = cells[2][0].getElementsByTagNameNS(W, "vMerge")[0];
    expect(cont).toBeTruthy();
    expect(cont.getAttribute("w:val")).toBeNull();
    expect(cells[2].map(textOf)).toEqual(["", "Feb", "On time"]);
  });
});

describe("layoutTableGrid", () => {
  function rowsOf(html: string) {
    const t = document.createElement("table");
    t.innerHTML = html;
    return Array.from(t.querySelectorAll("tr"));
  }

  it("pads short rows and clips rowspans that run past the table", () => {
    const { columnCount, grid } = layoutTableGrid(
      rowsOf(`<tr><td>a</td><td>b</td><td>c</td></tr><tr><td rowspan="9">d</td></tr>`),
    );
    expect(columnCount).toBe(3);
    expect(grid[1][0]).toMatchObject({ kind: "cell", rowSpan: 1 });
    expect(grid[1][1]).toBeUndefined();
  });
});

function makeDraft(bodyHtml: string, letterhead: boolean): Draft {
  return {
    id: "d1",
    mode: "employer",
    letterType: "warning",
    context: {
      mode: "employer",
      jurisdiction: "UK",
      workerClass: "employee",
      letterType: "warning",
      effectiveDate: "2026-01-01",
      issueDate: "2026-01-02",
      deliveryMethod: "email",
      tone: "formal",
      confidentiality: "public",
      counselReviewRequired: false,
      riskFlags: {
        protectedStatus: false,
        grievanceLast90Days: false,
        collectiveConsultation: false,
      },
    },
    employer: {
      legalName: "Acme Ltd",
      address: "",
      hasLetterhead: letterhead,
      letterheadDataUrl: letterhead ? ONE_BY_ONE_PNG : undefined,
      signatoryName: "Alex HR",
      signatoryTitle: "People Lead",
    },
    employee: {
      legalName: "Jamie Worker",
      jobTitle: "Analyst",
      address: "",
      startDate: "2025-01-01",
      serviceMonths: 12,
    },
    answers: {},
    sections: [
      {
        id: "s1",
        sectionId: "body",
        title: "Body",
        required: true,
        status: "ready",
        versions: [],
        html: bodyHtml,
      },
    ],
    createdAt: 0,
    updatedAt: 0,
  } as Draft;
}
