import { describe, it, expect } from "vitest";
import { mergeRemoteDrafts, type RemoteDraft } from "./remote-pull";
import { toServerUuid } from "./remote-ids";
import type { Draft } from "./letters/types";

function localDraft(overrides: Partial<Draft> = {}): Draft {
  return {
    id: "draft_1",
    mode: "employer",
    letterType: "warning",
    context: { jurisdiction: "UK" },
    employer: { legalName: "Acme", address: "" },
    employee: { legalName: "Jamie", jobTitle: "", address: "", startDate: "", serviceMonths: 0 },
    answers: {},
    sections: [
      {
        id: "sec_local_1",
        sectionId: "body",
        title: "Body",
        html: "<p>local body</p>",
        required: true,
        versions: [{ id: "v1" }],
        status: "ready",
      },
    ],
    comments: [{ id: "c1", body: "local comment" }],
    evidence: [{ id: "e1" }],
    timeline: [{ id: "t1" }],
    createdAt: 1000,
    updatedAt: 5000,
    ...overrides,
  } as unknown as Draft;
}

function remoteDraft(overrides: Partial<RemoteDraft> = {}): RemoteDraft {
  return {
    id: toServerUuid("draft_1"),
    letterType: "warning",
    mode: "employer",
    title: "Server title",
    jurisdiction: "UK",
    matterId: null,
    reviewStatus: "draft",
    isTemplateSource: false,
    templateSourceId: null,
    context: { jurisdiction: "UK" },
    employer: { legalName: "Acme", address: "" },
    employee: { legalName: "Jamie", jobTitle: "", address: "", startDate: "", serviceMonths: 0 },
    answers: {},
    createdAt: 1000,
    updatedAt: 9000,
    sections: [
      { sectionId: "body", title: "Body", html: "<p>server body</p>", status: "edited", position: 0 },
    ],
    ...overrides,
  };
}

describe("mergeRemoteDrafts — non-destructive cross-device merge", () => {
  it("adopts a remote-only draft under its server uuid", () => {
    const merged = mergeRemoteDrafts({}, [remoteDraft({ id: "uuid-remote-only" })]);
    expect(Object.keys(merged)).toEqual(["uuid-remote-only"]);
    expect(merged["uuid-remote-only"].sections[0].html).toBe("<p>server body</p>");
    // Local-only fields default to undefined for a freshly-adopted draft.
    expect(merged["uuid-remote-only"].comments).toBeUndefined();
  });

  it("overlays server content but PRESERVES local-only fields when both exist", () => {
    const local = { draft_1: localDraft() };
    const merged = mergeRemoteDrafts(local, [remoteDraft()]); // remote newer (9000 > 5000)
    const d = merged.draft_1;
    // Server-synced fields win:
    expect(d.title).toBe("Server title");
    expect(d.sections[0].html).toBe("<p>server body</p>");
    expect(d.updatedAt).toBe(9000);
    // Local-only fields survive untouched:
    expect(d.comments).toEqual([{ id: "c1", body: "local comment" }]);
    expect(d.evidence).toEqual([{ id: "e1" }]);
    expect(d.timeline).toEqual([{ id: "t1" }]);
    // The local id is kept (not replaced by the server uuid).
    expect(d.id).toBe("draft_1");
  });

  it("preserves local section id, versions, pendingChange, required by sectionId", () => {
    const local = { draft_1: localDraft() };
    const merged = mergeRemoteDrafts(local, [remoteDraft()]);
    const sec = merged.draft_1.sections[0];
    expect(sec.id).toBe("sec_local_1"); // local id kept
    expect(sec.versions).toEqual([{ id: "v1" }]); // local history kept
    expect(sec.required).toBe(true);
    // ...but the content + status come from the server.
    expect(sec.html).toBe("<p>server body</p>");
    expect(sec.status).toBe("edited");
  });

  it("does NOT clobber a local draft that is newer than the server copy", () => {
    const local = { draft_1: localDraft({ updatedAt: 20000, title: "Local newer" }) };
    const merged = mergeRemoteDrafts(local, [remoteDraft({ updatedAt: 9000 })]);
    // Local wins entirely — unchanged.
    expect(merged.draft_1.title).toBe("Local newer");
    expect(merged.draft_1.sections[0].html).toBe("<p>local body</p>");
    expect(merged.draft_1.updatedAt).toBe(20000);
  });

  it("keeps a local-only draft that has no server counterpart", () => {
    const local = { draft_offline: localDraft({ id: "draft_offline" }) };
    const merged = mergeRemoteDrafts(local, []);
    expect(merged.draft_offline).toBeDefined();
    expect(merged.draft_offline.sections[0].html).toBe("<p>local body</p>");
  });

  it("adopts a brand-new remote section's id while keeping existing ones stable", () => {
    const local = { draft_1: localDraft() };
    const merged = mergeRemoteDrafts(local, [
      remoteDraft({
        sections: [
          { sectionId: "body", title: "Body", html: "<p>b</p>", status: "ready", position: 0 },
          { sectionId: "closing", title: "Closing", html: "<p>c</p>", status: "ready", position: 1 },
        ],
      }),
    ]);
    const secs = merged.draft_1.sections;
    expect(secs).toHaveLength(2);
    expect(secs[0].id).toBe("sec_local_1"); // existing section keeps its local id
    expect(secs[1].id).toMatch(/^sec/); // new section gets a generated id
    expect(secs[1].sectionId).toBe("closing");
  });
});
