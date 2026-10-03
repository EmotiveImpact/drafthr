import { describe, expect, it } from "vitest";
import { isDraftSnapshot, snapshotSections } from "./_draft-snapshot";
import { toServerUuid } from "../../../src/lib/remote-ids";

const draft = {
  id: "draft_legacy_1",
  mode: "employer",
  letterType: "offer",
  context: { mode: "employer", jurisdiction: "uk" },
  employer: { legalName: "Acme" },
  employee: { legalName: "Alex" },
  answers: {},
  sections: [{
    id: "sec_1", sectionId: "opening", title: "Opening", html: "<p>Hello</p>",
    required: true, versions: [{ id: "version_1", createdAt: 1, html: "<p>Old</p>" }], status: "edited",
  }],
  evidence: [{ id: "e_1", kind: "note", content: "Call notes", uploadedAt: 1, includeVerbatim: false }],
  comments: [{ id: "c_1", body: "Check this" }],
  createdAt: 1,
  updatedAt: 2,
};

describe("complete draft snapshot boundary", () => {
  it("accepts a legacy local id matching the server UUID without stripping history", () => {
    expect(isDraftSnapshot(draft, toServerUuid(draft.id))).toBe(true);
    if (isDraftSnapshot(draft, toServerUuid(draft.id))) {
      expect(draft.sections[0].versions).toHaveLength(1);
      expect(snapshotSections(draft)[0]).toEqual({
        sectionId: "opening", title: "Opening", html: "<p>Hello</p>", status: "edited", position: 0,
      });
    }
  });

  it("rejects a mismatched id and incomplete section", () => {
    expect(isDraftSnapshot(draft, toServerUuid("someone_else"))).toBe(false);
    expect(isDraftSnapshot({ ...draft, sections: [{ ...draft.sections[0], versions: undefined }] }, toServerUuid(draft.id))).toBe(false);
  });
});
