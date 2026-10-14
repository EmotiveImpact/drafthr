import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  LETTER_END_CLASS,
  SIGNOFF_CLASS,
  letterBodyHtml,
  paginateForPdf,
} from "@/lib/export/pdf";
import type { Draft } from "@/lib/letters/types";

// SEND-X36: the sign-off ("Yours sincerely," through the signatory's name and
// title) must never split across pages, and the closing small print must
// never sit on a page of its own, also when evidence is attached (which puts
// an Attachments list between the sign-off and the small print).

function section(sectionId: string, html: string) {
  return {
    id: sectionId,
    sectionId,
    title: sectionId,
    required: true,
    status: "ready" as const,
    versions: [],
    html,
  };
}

function makeDraft(attachments: number): Draft {
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
      hasLetterhead: false,
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
      section("body", "<p>Body one.</p><p>Body two.</p><p>Body three.</p>"),
      section("closing", "<p>Thank you for attending.</p><p>I do not take this decision lightly.</p><p>Yours sincerely,</p>"),
      section("signature", "<p>Alex HR</p><p>People Lead</p>"),
    ],
    evidence: Array.from({ length: attachments }, (_, i) => ({
      id: `e${i}`,
      kind: "note",
      displayMode: "attached",
      filename: `Note ${i + 1}.pdf`,
      content: "",
      createdAt: 0,
    })),
    createdAt: 0,
  } as unknown as Draft;
}

// jsdom has no layout. Stand one in: a block's height is its data-h (px),
// else the sum of its child blocks, else one 24px line; a page's content box
// is as tall as its inline height (in inches, at 96px per inch).
const LINE = 24;
function heightOf(el: Element): number {
  const fixed = el.getAttribute("data-h");
  if (fixed) return Number(fixed);
  const kids = Array.from(el.children);
  if (kids.length === 0) return LINE;
  return kids.reduce((sum, k) => sum + heightOf(k), 0);
}
const saved: Record<string, PropertyDescriptor | undefined> = {};
beforeEach(() => {
  for (const prop of ["scrollHeight", "clientHeight"]) {
    saved[prop] = Object.getOwnPropertyDescriptor(HTMLElement.prototype, prop);
  }
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get(this: HTMLElement) {
      return Array.from(this.children).reduce((sum, k) => sum + heightOf(k), 0);
    },
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get(this: HTMLElement) {
      const h = this.style.height;
      if (h.endsWith("in")) return parseFloat(h) * 96;
      return heightOf(this);
    },
  });
});
afterEach(() => {
  for (const [prop, desc] of Object.entries(saved)) {
    if (desc) Object.defineProperty(HTMLElement.prototype, prop, desc);
    else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[prop];
  }
  document.body.innerHTML = "";
});

/** The page's content box height in px (A4 less the top and bottom margins). */
const PAGE_CONTENT = (11.69 - 2) * 96;

function layOut(draft: Draft, bodyParagraphPx: number): HTMLElement[] {
  const source = document.createElement("div");
  source.innerHTML = letterBodyHtml(draft);
  // Make the body tall enough to push the end of the letter to the page foot.
  for (const p of Array.from(source.querySelectorAll("p"))) {
    if (p.textContent?.startsWith("Body")) p.setAttribute("data-h", String(bodyParagraphPx));
  }
  document.body.appendChild(source);
  const pages = paginateForPdf(source, document);
  source.remove();
  return pages;
}

function pageOf(pages: HTMLElement[], text: string): number[] {
  const hits: number[] = [];
  pages.forEach((page, i) => {
    if ((page.textContent ?? "").includes(text)) hits.push(i);
  });
  return hits;
}

describe("letterBodyHtml: the end of the letter", () => {
  it("keeps the sign-off, the Attachments list and the closing in one keep-together group", () => {
    const host = document.createElement("div");
    host.innerHTML = letterBodyHtml(makeDraft(2));
    const end = host.querySelector(`.${LETTER_END_CLASS}`);
    expect(end).not.toBeNull();
    expect(end!.getAttribute("style")).toContain("break-inside:avoid");
    const signoff = end!.querySelector(`.${SIGNOFF_CLASS}`);
    expect(signoff?.textContent).toContain("Yours sincerely,");
    expect(signoff?.textContent).toContain("Alex HR");
    expect(signoff?.textContent).toContain("People Lead");
    expect(end!.querySelector(".attachments-block")?.textContent).toContain("Note 1.pdf");
    expect(end!.querySelector(".letter-closing")).not.toBeNull();
    // The line just before "Yours sincerely," goes with it, so a page never
    // starts cold on the sign-off; the rest of the letter flows as usual.
    expect(end!.textContent).toContain("I do not take this decision lightly.");
    expect(signoff?.textContent).not.toContain("I do not take this decision lightly.");
    expect(end!.textContent).not.toContain("Thank you for attending.");
    expect(host.textContent).toContain("Thank you for attending.");
    expect(end!.textContent).not.toContain("Body one.");
  });
});

describe("paginateForPdf: the sign-off is never split (SEND-X36)", () => {
  it("takes the whole sign-off over with the small print when the end of the letter does not fit, with evidence attached", () => {
    // Body ends about 150px above the page foot: the sign-off fits there,
    // the attachments and small print do not.
    const pages = layOut(makeDraft(2), Math.floor((PAGE_CONTENT - 150) / 3));
    expect(pages.length).toBe(2);
    const sincerely = pageOf(pages, "Yours sincerely,");
    const name = pageOf(pages, "Alex HR");
    const title = pageOf(pages, "People Lead");
    const smallPrint = pageOf(pages, "Note 2.pdf");
    expect(sincerely).toEqual([1]);
    expect(name).toEqual(sincerely);
    expect(title).toEqual(sincerely);
    expect(smallPrint).toEqual(sincerely);
    // The page it leaves keeps the letter.
    expect(pageOf(pages, "Body three.")).toEqual([0]);
    expect(pages[1].querySelector(".letter-closing")).not.toBeNull();
  });

  it("keeps everything on one page when it fits", () => {
    const pages = layOut(makeDraft(2), 100);
    expect(pages.length).toBe(1);
  });

  it("flows a very long ending on from the letter, keeping the sign-off whole", () => {
    // So many attachments that the end of the letter is taller than a page.
    const pages = layOut(makeDraft(45), Math.floor((PAGE_CONTENT - 300) / 3));
    // No gap: the sign-off stays under the letter on the first page.
    const sincerely = pageOf(pages, "Yours sincerely,");
    expect(sincerely).toEqual([0]);
    expect(pageOf(pages, "People Lead")).toEqual(sincerely);
    // The small print follows the last attachment, never alone on a page.
    const last = pages[pages.length - 1];
    expect(last.querySelector(".letter-closing")).not.toBeNull();
    expect(last.textContent).toContain("Note 45.pdf");
  });
});
