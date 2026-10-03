import { describe, expect, it } from "vitest";
import { getLetterMeta } from "@/lib/letters/catalog";
import type { Draft } from "@/lib/letters/types";
import {
  counselAttestationForDraft,
  countUnresolvedPlaceholders,
  getDraftReadiness,
} from "./readiness";
import { runHealthChecks } from "./healthChecks";

function makeDraft(
  letterType: Draft["letterType"] = "reference",
  overrides: Partial<Draft> = {},
): Draft {
  const meta = getLetterMeta(letterType);
  return {
    id: "draft_ready",
    mode: meta.mode,
    letterType,
    context: {
      mode: meta.mode,
      jurisdiction: "UK",
      workerClass: "employee",
      letterType,
      effectiveDate: "2026-09-14",
      issueDate: "2026-09-14",
      deliveryMethod: "email",
      tone: "formal",
      confidentiality: "public",
      counselReviewRequired: meta.legalReviewRequired,
      riskFlags: {
        protectedStatus: false,
        grievanceLast90Days: false,
        collectiveConsultation: false,
      },
    },
    employer: {
      legalName: "Acme Ltd",
      address: "1 High Street, London",
      hasLetterhead: false,
      signatoryName: "Alex Manager",
      signatoryTitle: "HR Director",
    },
    employee: {
      legalName: "Jamie Worker",
      jobTitle: "Analyst",
      address: "2 Low Street, London",
      startDate: "2024-01-01",
      serviceMonths: 24,
    },
    answers: {},
    sections: meta.defaultSections.map((section, index) => ({
      id: `section_${index}`,
      sectionId: section.id,
      title: section.title,
      required: section.required,
      html: `<p>Completed ${section.title} content.</p>`,
      status: "edited",
      versions: [],
    })),
    evidence: [],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("canonical draft readiness", () => {
  it("blocks all final actions during generation, then releases them on completion", () => {
    const draft = makeDraft();
    draft.sections[0].status = "streaming";
    expect(getDraftReadiness(draft)).toMatchObject({
      editingComplete: false, canFinalise: false, canExport: false, canMarkSent: false,
    });
    expect(getDraftReadiness(draft).blockers.map(b => b.id)).toContain("generation-active");
    draft.sections[0].status = "ready";
    expect(getDraftReadiness(draft)).toMatchObject({
      editingComplete: true, canFinalise: true, canExport: true, canMarkSent: true,
    });
  });

  it("never permits a sectionless letter to be exported", () => {
    expect(getDraftReadiness(makeDraft("reference", { sections: [] })).canExport).toBe(false);
  });

  it("blocks a broken reference in both Review health and Finalise, and unblocks after repair", () => {
    const draft = makeDraft();
    draft.sections[0].html = "<p>See the attached record [See Fig 1].</p>";
    expect(runHealthChecks(draft).find(c => c.id === "evidence")?.severity).toBe("fail");
    expect(getDraftReadiness(draft)).toMatchObject({
      canExport: false, canMarkSent: false, evidence: { brokenReferences: 1 },
    });
    draft.evidence = [{ id: "e1", kind: "document", content: "Record", uploadedAt: 1, includeVerbatim: false }];
    expect(runHealthChecks(draft).find(c => c.id === "evidence")?.severity).toBe("pass");
    expect(getDraftReadiness(draft).canExport).toBe(true);
  });

  it("uses the current counsel decision, preserving export history after update, clear and reload", () => {
    const draft = makeDraft("termination");
    draft.exports = [{ id: "export1", format: "pdf", exportedAt: 10,
      reviewedBy: "Old Reviewer", reviewedOn: "2026-01-01" }];
    draft.answers._counselReview = { reviewedBy: "Current Reviewer", reviewedOn: "2026-09-14" };
    expect(counselAttestationForDraft(draft)?.reviewedBy).toBe("Current Reviewer");
    expect(getDraftReadiness(draft).counsel.attested).toBe(true);
    delete draft.answers._counselReview;
    const reloaded = JSON.parse(JSON.stringify(draft)) as Draft;
    expect(counselAttestationForDraft(reloaded)).toBeUndefined();
    expect(getDraftReadiness(reloaded).blockers.map(b => b.id)).toContain("counsel-review");
    expect(reloaded.exports?.[0].reviewedBy).toBe("Old Reviewer");
  });

  it("does not treat a legacy export or a blank reviewer name as current sign-off", () => {
    const draft = makeDraft("termination");
    draft.exports = [{ id: "export1", format: "pdf", exportedAt: 10,
      reviewedBy: "Old Reviewer", reviewedOn: "2026-01-01" }];
    expect(counselAttestationForDraft(draft)).toBeUndefined();
    draft.answers._counselReview = { reviewedBy: "  ", reviewedOn: "2026-09-14" };
    expect(counselAttestationForDraft(draft)).toBeUndefined();
  });
  it("counts every unresolved placeholder occurrence but ignores figure references", () => {
    expect(
      countUnresolvedPlaceholders(
        "<p>[TBD] and [TBD: date] and {{employeeName}} and [Employee address] [See Fig 1]</p>",
      ),
    ).toBe(4);
  });

  it("keeps written, reviewed, and ready section states distinct", () => {
    const draft = makeDraft("reference", {
      sections: [
        {
          id: "one",
          sectionId: "body",
          title: "Body",
          required: true,
          html: "<p>Written but [TBD].</p>",
          status: "edited",
          versions: [],
        },
      ],
    });
    const readiness = getDraftReadiness(draft);

    expect(readiness.sections).toMatchObject({ written: 1, ready: 0, reviewed: 0 });
    expect(readiness.placeholders.count).toBe(1);
    expect(readiness.canExport).toBe(false);
    expect(readiness.canMarkSent).toBe(false);
  });

  it("blocks a high-risk termination on required evidence and counsel", () => {
    const readiness = getDraftReadiness(makeDraft("termination"));

    expect(readiness.evidence.requiredMissing).toBeGreaterThan(0);
    expect(readiness.counsel).toMatchObject({ required: true, attested: false });
    expect(readiness.blockers.map((issue) => issue.id)).toEqual(
      expect.arrayContaining(["required-evidence", "counsel-review"]),
    );
    expect(readiness.canExport).toBe(false);
  });

  it("allows a complete low-risk reference without a counsel gate", () => {
    const readiness = getDraftReadiness(makeDraft("reference"));

    expect(readiness.counsel).toMatchObject({ required: false, attested: false });
    expect(readiness.blockers).toHaveLength(0);
    expect(readiness.status).toBe("ready_to_send");
    expect(readiness.canExport).toBe(true);
  });

  it("recognises attached and external letterhead states honestly", () => {
    const attached = getDraftReadiness(
      makeDraft("reference", {
        employer: {
          legalName: "Acme Ltd",
          address: "1 High Street",
          signatoryName: "Alex Manager",
          signatoryTitle: "HR Director",
          hasLetterhead: true,
          letterheadDataUrl: "data:image/png;base64,iVBORw0KGgo=",
        },
      }),
    );
    const external = getDraftReadiness(
      makeDraft("reference", {
        employer: {
          legalName: "Acme Ltd",
          address: "1 High Street",
          signatoryName: "Alex Manager",
          signatoryTitle: "HR Director",
          hasLetterhead: true,
        },
      }),
    );

    expect(attached.letterheadAttached).toBe(true);
    expect(external.usesExternalLetterhead).toBe(true);
  });
});
