import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Draft } from "@/lib/letters/types";

// Install a memory localStorage BEFORE importing the store module. The
// store uses zustand/middleware persist, which captures the global
// localStorage reference at module-evaluation time — so the swap has to
// land first to keep `setItem` writable across resetModules() cycles.
installMemoryLocalStorage();

type DraftStoreModule = typeof import("@/lib/store");
type MobileReadViewModule = typeof import("./MobileReadView");

let useDraftStore: DraftStoreModule["useDraftStore"];
let MobileReadView: MobileReadViewModule["MobileReadView"];

describe("MobileReadView", () => {
  beforeEach(async () => {
    installMemoryLocalStorage();
    vi.resetModules();
    ({ useDraftStore } = await import("@/lib/store"));
    ({ MobileReadView } = await import("./MobileReadView"));
    useDraftStore.setState({ drafts: {}, matters: {} });
  });

  afterEach(() => {
    cleanup();
    useDraftStore.setState({ drafts: {}, matters: {} });
    window.localStorage.clear();
  });

  it("renders the letter body for an existing draft, without editor chrome", () => {
    useDraftStore.setState({
      drafts: { draft_a: makeDraft("draft_a", "Joiner offer — Jane Doe") },
      matters: {},
    });

    renderAt("/m/draft_a");

    // Letter body shows up (the sample HTML below contains a recognisable
    // marker). Use querySelector since the content is injected via
    // dangerouslySetInnerHTML.
    const article = document.querySelector(".mobile-letter");
    expect(article).not.toBeNull();
    expect(article?.textContent ?? "").toContain("Dear Jane");

    // Title pill shows the resolved title.
    expect(screen.getByText("Joiner offer — Jane Doe")).toBeInTheDocument();

    // Done button is reachable.
    expect(screen.getByTestId("mobile-read-done")).toBeInTheDocument();

    // No editor surfaces leak in.
    expect(document.querySelector('[contenteditable="true"]')).toBeNull();
    expect(screen.queryByText(/AI rail|Sections rail|Comments/i)).toBeNull();
  });

  it("shows 'Draft not found' for a missing draft and links to sign-in", () => {
    renderAt("/m/does-not-exist");

    expect(screen.getByText("Draft not found")).toBeInTheDocument();
    const signInLink = screen.getByRole("link", { name: /sign in to view/i });
    expect(signInLink).toHaveAttribute("href", "/sign-in");

    // No leak: the letter body container isn't even rendered for missing drafts.
    expect(document.querySelector(".mobile-letter")).toBeNull();
  });

  it("treats drafts not visible to the user (e.g. different tenant) the same as missing — no leak", () => {
    // The local zustand store is the source of truth on this device. A draft
    // belonging to a different tenant is, by construction, absent from the
    // store on this browser — so it should render "Draft not found" without
    // any letter content surfacing.
    useDraftStore.setState({
      drafts: { draft_other_tenant: makeDraft("draft_other_tenant", "Other") },
      matters: {},
    });

    // Navigate to a different id than what's in the store.
    renderAt("/m/draft_for_this_user");

    expect(screen.getByText("Draft not found")).toBeInTheDocument();
    expect(screen.queryByText("Dear Jane")).toBeNull();
    expect(document.querySelector(".mobile-letter")).toBeNull();
  });

  it("Done button navigates back when history depth allows", () => {
    useDraftStore.setState({
      drafts: { draft_a: makeDraft("draft_a", "T") },
      matters: {},
    });

    // window.history.length reflects the global jsdom session, not the
    // MemoryRouter stack. Force the >1 branch so the click invokes
    // navigate(-1) instead of the fallback navigate("/") path.
    const originalLength = window.history.length;
    Object.defineProperty(window.history, "length", {
      configurable: true,
      get: () => 2,
    });

    try {
      // MemoryRouter with two entries — index 1 ("/m/draft_a") is current.
      render(
        <MemoryRouter initialEntries={["/editor/draft_a", "/m/draft_a"]} initialIndex={1}>
          <Routes>
            <Route path="/m/:draftId" element={<MobileReadView />} />
            <Route path="/editor/:draftId" element={<LocationProbe />} />
          </Routes>
        </MemoryRouter>,
      );

      fireEvent.click(screen.getByTestId("mobile-read-done"));

      // After navigate(-1), the router should land on the previous entry.
      expect(screen.getByTestId("location")).toHaveTextContent("/editor/draft_a");
    } finally {
      Object.defineProperty(window.history, "length", {
        configurable: true,
        get: () => originalLength,
      });
    }
  });
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/m/:draftId" element={<MobileReadView />} />
        <Route path="/sign-in" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="location">{loc.pathname}</div>;
}

function installMemoryLocalStorage() {
  const entries = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return entries.size;
    },
    clear() {
      entries.clear();
    },
    getItem(key: string) {
      return entries.get(key) ?? null;
    },
    key(index: number) {
      return [...entries.keys()][index] ?? null;
    },
    removeItem(key: string) {
      entries.delete(key);
    },
    setItem(key: string, value: string) {
      entries.set(key, value);
    },
  };
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: storage,
  });
}

function makeDraft(id: string, title: string): Draft {
  const now = Date.now();
  return {
    id,
    mode: "employer",
    letterType: "offer",
    title,
    context: {
      mode: "employer",
      jurisdiction: "UK",
      ukRegion: "England & Wales",
      workerClass: "employee",
      letterType: "offer",
      effectiveDate: "2026-05-18",
      issueDate: "2026-05-18",
      deliveryMethod: "email",
      tone: "neutral",
      confidentiality: "confidential",
      counselReviewRequired: false,
      riskFlags: {
        protectedStatus: false,
        grievanceLast90Days: false,
        collectiveConsultation: false,
      },
    },
    employer: {
      legalName: "Acme Ltd",
      address: "1 Road",
      hasLetterhead: false,
      signatoryName: "HR",
      signatoryTitle: "People",
    },
    employee: {
      legalName: "Jane Doe",
      jobTitle: "Analyst",
      address: "2 Street",
      startDate: "2025-01-01",
      serviceMonths: 12,
    },
    answers: {},
    sections: [
      {
        id: "section_1",
        sectionId: "body",
        title: "Body",
        html: "<p>Dear Jane,</p><p>Welcome to Acme Ltd.</p>",
        required: true,
        versions: [],
        status: "ready",
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
}
