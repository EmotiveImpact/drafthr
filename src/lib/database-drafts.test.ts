import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Draft } from "./letters/types";
import { toServerUuid } from "./remote-ids";

function makeDraft(id = "draft_local"): Draft {
  return {
    id, mode: "employer", letterType: "offer" as Draft["letterType"],
    context: { mode: "employer", jurisdiction: "UK" } as Draft["context"],
    employer: { legalName: "Acme", address: "", hasLetterhead: false, signatoryName: "", signatoryTitle: "" },
    employee: { legalName: "Alex", jobTitle: "", address: "", startDate: "", serviceMonths: 0 },
    answers: {},
    sections: [{ id: "sec_1", sectionId: "opening", title: "Opening", html: "<p>Hello</p>", required: true, versions: [], status: "edited" }],
    createdAt: 1, updatedAt: 2,
  } as Draft;
}

beforeEach(() => {
  localStorage.clear();
  vi.stubEnv("VITE_DRAFTHR_DATABASE_DRAFTS", "true");
  vi.stubEnv("VITE_DRAFTHR_DUAL_WRITE", "false");
  vi.resetModules();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("database-authoritative draft client", () => {
  it("loads a complete server draft and saves a subsequent edit with its base revision", async () => {
    const server = makeDraft("draft_server");
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init?.method) return new Response(JSON.stringify({ documents: [{ id: toServerUuid(server.id), revision: 4, snapshot: server }], nextCursor: null }), { status: 200 });
      return new Response(JSON.stringify({ ok: true, revision: 5 }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { useDraftStore } = await import("./store");
    const mod = await import("./database-drafts");
    await mod.initializeDatabaseDrafts("11111111-1111-4111-8111-111111111111");
    expect(mod.useDatabaseDraftStatus.getState().phase).toBe("ready");
    expect(useDraftStore.getState().drafts[server.id].sections[0].html).toBe("<p>Hello</p>");

    const edited = { ...server, sections: [{ ...server.sections[0], html: "<p>Edited</p>" }], updatedAt: 3 };
    useDraftStore.setState({ drafts: { [server.id]: edited } });
    expect(await mod.flushDatabaseDrafts()).toBe(true);
    const write = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(write).toBeDefined();
    const body = JSON.parse(write![1]!.body as string);
    expect(body.baseRevision).toBe(4);
    expect(body.snapshot.sections[0].html).toBe("<p>Edited</p>");
    expect(mod.useDatabaseDraftStatus.getState().failed).toBe(0);
  });

  it("keeps an unacknowledged conflict on this device and blocks sign-out flush", async () => {
    const server = makeDraft("draft_server_conflict");
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method
        ? new Response(JSON.stringify({ error: "stale revision" }), { status: 409 })
        : new Response(JSON.stringify({ documents: [{ id: toServerUuid(server.id), revision: 2, snapshot: server }], nextCursor: null }), { status: 200 }),
    ));
    const { useDraftStore } = await import("./store");
    const mod = await import("./database-drafts");
    await mod.initializeDatabaseDrafts("22222222-2222-4222-8222-222222222222");
    const edited = { ...server, title: "Do not lose this edit", updatedAt: 3 };
    useDraftStore.setState({ drafts: { [server.id]: edited } });
    expect(await mod.flushDatabaseDrafts()).toBe(false);
    expect(useDraftStore.getState().drafts[server.id].title).toBe("Do not lose this edit");
    expect(mod.useDatabaseDraftStatus.getState().conflicts).toBe(1);
  });

  it("requires explicit import and forks a divergent browser draft", async () => {
    const server = makeDraft("draft_shared");
    const local = { ...server, title: "Browser-only work", updatedAt: 4 };
    const documents = [{ id: toServerUuid(server.id), revision: 3, snapshot: server }];
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init?.method) return new Response(JSON.stringify({ documents, nextCursor: null }), { status: 200 });
      const body = JSON.parse(init.body as string) as { id: string; snapshot: Draft };
      documents.push({ id: body.id, revision: 1, snapshot: body.snapshot });
      return new Response(JSON.stringify({ ok: true, revision: 1 }), { status: 201 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { useDraftStore } = await import("./store");
    useDraftStore.setState({ drafts: { [local.id]: local } });
    const mod = await import("./database-drafts");
    await mod.initializeDatabaseDrafts("33333333-3333-4333-8333-333333333333");
    expect(mod.useDatabaseDraftStatus.getState().phase).toBe("needs-import");
    expect(useDraftStore.getState().drafts[local.id].title).toBe("Browser-only work");
    await mod.importBrowserDrafts();
    expect(mod.useDatabaseDraftStatus.getState().phase).toBe("ready");
    expect(documents).toHaveLength(2);
    expect(documents[0].snapshot.title).toBeUndefined();
    expect(documents[1].snapshot.title).toContain("recovered browser copy");
  });

  it("passes the legacy timestamp when first promoting a partial server row", async () => {
    const old = makeDraft("draft_legacy_remote");
    const legacy = {
      id: toServerUuid(old.id), letterType: old.letterType, mode: old.mode, title: null,
      jurisdiction: "UK", matterId: null, reviewStatus: "draft", isTemplateSource: false,
      templateSourceId: null, context: old.context, employer: old.employer,
      employee: old.employee, answers: old.answers, createdAt: 100, updatedAt: 900,
      sections: [{ sectionId: "opening", title: "Opening", html: "<p>Hello</p>", status: "edited", position: 0 }],
    };
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method
        ? new Response(JSON.stringify({ ok: true, revision: 1 }), { status: 200 })
        : new Response(JSON.stringify({ documents: [{ id: legacy.id, revision: 0, snapshot: null, legacy }], nextCursor: null }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { useDraftStore } = await import("./store");
    const mod = await import("./database-drafts");
    await mod.initializeDatabaseDrafts("44444444-4444-4444-8444-444444444444");
    const adopted = useDraftStore.getState().drafts[legacy.id];
    useDraftStore.setState({ drafts: { [legacy.id]: { ...adopted, title: "Promoted" } } });
    expect(await mod.flushDatabaseDrafts()).toBe(true);
    const write = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    const body = JSON.parse(write![1]!.body as string);
    expect(body.baseRevision).toBe(0);
    expect(body.legacyUpdatedAt).toBe(900);
  });

  it("confirms a server delete before allowing a clean flush", async () => {
    const server = makeDraft("draft_to_delete");
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "DELETE"
        ? new Response(JSON.stringify({ ok: true }), { status: 200 })
        : new Response(JSON.stringify({ documents: [{ id: toServerUuid(server.id), revision: 1, snapshot: server }], nextCursor: null }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { useDraftStore } = await import("./store");
    const mod = await import("./database-drafts");
    const tenant = "55555555-5555-4555-8555-555555555555";
    await mod.initializeDatabaseDrafts(tenant);
    useDraftStore.setState({ drafts: {} });
    expect(await mod.flushDatabaseDrafts()).toBe(true);
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(true);
    expect(localStorage.getItem(`drafthr.db-draft-deletes.v1:${tenant}`)).toBe("[]");
  });

  it("cancels a pending server delete when the user immediately undoes it", async () => {
    const server = makeDraft("draft_undo");
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method
        ? new Response(JSON.stringify({ ok: true, revision: 2 }), { status: 200 })
        : new Response(JSON.stringify({ documents: [{ id: toServerUuid(server.id), revision: 1, snapshot: server }], nextCursor: null }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { useDraftStore } = await import("./store");
    const mod = await import("./database-drafts");
    await mod.initializeDatabaseDrafts("66666666-6666-4666-8666-666666666666");
    useDraftStore.setState({ drafts: {} });
    useDraftStore.setState({ drafts: { [server.id]: server } });
    expect(await mod.flushDatabaseDrafts()).toBe(true);
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);
  });
});
