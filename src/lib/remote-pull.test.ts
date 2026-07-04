import { describe, it, expect } from "vitest";
import {
  mergeRemoteDrafts,
  mergeRemoteExtras,
  extractExtras,
  type RemoteDraft,
  type RemoteExtras,
} from "./remote-pull";
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

  it("never adopts a tombstoned row (delete pending — BUG-05 resurrection)", () => {
    const merged = mergeRemoteDrafts({}, [remoteDraft({ id: "uuid-deleted" })], new Set(["uuid-deleted"]));
    expect(Object.keys(merged)).toEqual([]);
  });

  it("a tombstoned row that ALSO exists locally still merges (Undo restored it)", () => {
    const local = { draft_1: localDraft() };
    const merged = mergeRemoteDrafts(local, [remoteDraft()], new Set([toServerUuid("draft_1")]));
    // Server copy is newer (9000 > 5000) so the overlay applies as usual.
    expect(merged.draft_1.sections[0].html).toBe("<p>server body</p>");
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

  it("gives DISTINCT ids to duplicate remote sectionIds (no React key collision)", () => {
    const local = { draft_1: localDraft() };
    const merged = mergeRemoteDrafts(local, [
      remoteDraft({
        sections: [
          { sectionId: "body", title: "Body", html: "<p>1</p>", status: "ready", position: 0 },
          { sectionId: "body", title: "Body", html: "<p>2</p>", status: "ready", position: 1 },
        ],
      }),
    ]);
    const ids = merged.draft_1.sections.map((s) => s.id);
    expect(new Set(ids).size).toBe(2); // no duplicate ids
    expect(ids[0]).toBe("sec_local_1"); // first reuses the local id (consumed once)
  });

  it("does NOT wipe local answers when the server stores answers=null", () => {
    const local = { draft_1: localDraft({ answers: { tone: "firm", q1: "x" } as never }) };
    const merged = mergeRemoteDrafts(local, [remoteDraft({ answers: null as never })]);
    expect(merged.draft_1.answers).toEqual({ tone: "firm", q1: "x" });
  });

  it("preserves the immutable local createdAt across an overlay", () => {
    const local = { draft_1: localDraft({ createdAt: 500 }) };
    const merged = mergeRemoteDrafts(local, [remoteDraft({ createdAt: 99999, updatedAt: 9000 })]);
    expect(merged.draft_1.createdAt).toBe(500);
  });

  it("keeps local on an equal-updatedAt tie (no same-ms clobber)", () => {
    const local = { draft_1: localDraft({ updatedAt: 9000, title: "Local tie" }) };
    const merged = mergeRemoteDrafts(local, [remoteDraft({ updatedAt: 9000, title: "Server tie" })]);
    expect(merged.draft_1.title).toBe("Local tie");
  });

  it("adopts a remote-only draft with schema-valid party blocks when server fields are null", () => {
    const merged = mergeRemoteDrafts({}, [
      remoteDraft({ id: "uuid-x", employer: null, employee: null }),
    ]);
    const d = merged["uuid-x"];
    expect(d.employer.legalName).toBe("");
    expect(d.employer.hasLetterhead).toBe(false);
    expect(d.employee.serviceMonths).toBe(0);
    expect(typeof d.employee.jobTitle).toBe("string");
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

describe("mergeRemoteExtras — collaboration-data union (non-destructive)", () => {
  it("unions comments by id (no local OR remote comment lost), ordered by createdAt", () => {
    const local = {
      draft_1: localDraft({
        comments: [
          { id: "c1", body: "local one", createdAt: 100 },
          { id: "c2", body: "local two", createdAt: 300 },
        ] as never,
      }),
    };
    const remote: RemoteExtras[] = [
      {
        id: toServerUuid("draft_1"),
        extras: {
          comments: [
            { id: "c2", body: "REMOTE edit of c2", createdAt: 300 } as never, // collision → local wins
            { id: "c3", body: "remote three", createdAt: 200 } as never, // remote-only → added
          ],
        },
      },
    ];
    const merged = mergeRemoteExtras(local, remote);
    const comments = merged.draft_1.comments ?? [];
    expect(comments.map((c) => c.id)).toEqual(["c1", "c3", "c2"]); // sorted by createdAt
    // Local content wins on id collision (c2 keeps local body).
    expect(comments.find((c) => c.id === "c2")?.body).toBe("local two");
    // Remote-only comment is adopted.
    expect(comments.find((c) => c.id === "c3")?.body).toBe("remote three");
  });

  it("fills outcomeSought only when local is empty; skips drafts not held locally", () => {
    const local = { draft_1: localDraft({ outcomeSought: undefined }) };
    const merged = mergeRemoteExtras(local, [
      { id: toServerUuid("draft_1"), extras: { outcomeSought: "Reinstatement" } },
      { id: "uuid-unknown", extras: { outcomeSought: "ignored" } }, // no local draft → skipped
    ]);
    expect(merged.draft_1.outcomeSought).toBe("Reinstatement");
    expect(merged["uuid-unknown"]).toBeUndefined();
  });

  it("extractExtras returns null when there's nothing collaborative to sync", () => {
    expect(extractExtras(localDraft({ comments: [], timeline: [], evidence: [] }))).toBeNull();
    const withComment = localDraft({
      comments: [{ id: "c1", body: "x", createdAt: 1 }] as never,
    });
    expect(extractExtras(withComment)?.comments?.length).toBe(1);
  });
});
