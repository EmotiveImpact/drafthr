import { expect, it } from "vitest";
import { workspaceRecoveryCopy } from "./workspace-recovery-copy";
import type { Draft } from "./letters/types";

it("preserves draft content and evidence but never copies approval/export or sharing authority", () => {
  const original = { id: "old", letterType: "offer", title: "Fictional", createdAt: 1, updatedAt: 2,
    sections: [{ html: "<p>Pending text</p>" }], evidence: [{ fileId: "file", content: "Evidence" }],
    matterId: "matter", employeeId: "employee", templateSourceId: "template", isTemplateSource: true,
    reviewStatus: "approved", submittedForReviewAt: 3, reviewDecidedAt: 4, approvals: [{ id: "decision" }],
    exports: [{ id: "export" }], timeline: [{ id: "event" }], collaborators: [{ id: "person" }],
  } as unknown as Draft;
  const copy = workspaceRecoveryCopy("user:tenant", "drafts", original) as Draft;
  expect(copy.sections).toEqual(original.sections); expect(copy.evidence).toEqual(original.evidence);
  expect(copy.matterId).toBe("matter"); expect(copy.employeeId).toBe("employee");
  expect(copy.title).toBe("Fictional (recovered copy)"); expect(copy.reviewStatus).toBe("draft");
  expect(copy.approvals).toEqual([]); expect(copy.exports).toEqual([]); expect(copy.collaborators).toEqual([]);
  expect(copy.submittedForReviewAt).toBeUndefined(); expect(copy.reviewDecidedAt).toBeUndefined();
  expect(copy.templateSourceId).toBeUndefined(); expect(copy.isTemplateSource).toBe(false);
  expect(workspaceRecoveryCopy("user:tenant", "drafts", original)).toEqual(copy);
  expect(workspaceRecoveryCopy("other:tenant", "drafts", original).id).not.toBe(copy.id);
  expect(original.reviewStatus).toBe("approved"); expect(original.exports).toHaveLength(1);
});
