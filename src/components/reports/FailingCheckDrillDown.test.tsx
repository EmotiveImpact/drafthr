import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";

import type { Draft, Matter } from "@/lib/letters/types";
import {
  HEALTH_CHECKS,
  failingDraftsForCheck,
} from "@/lib/reports/check-predicates";

/* ============================================================================
 * Tests for FailingCheckDrillDown — /reports/checks/:checkId
 *
 * Two layers:
 *
 *   1. Predicate-level invariants — directly call the predicates from
 *      `lib/reports/check-predicates.ts` against fixtures. We assert:
 *        - failing drafts surface with a non-empty reason
 *        - passing drafts return null (don't appear)
 *        - each predicate detects a draft engineered to trip it
 *
 *   2. Component-level — render the drill-down with a fixture store and
 *      assert it lists the right rows + navigates to /editor/:id on click.
 *
 * Layer 1 protects against silent regressions in the predicates; layer 2
 * protects the wiring. Together they cover everything the brief asks for.
 * ==========================================================================*/

/* ---------- store mock (shared with FailingCheckDrillDown.test) ----------- */

const storeMock = vi.hoisted(() => ({
  drafts: {} as Record<string, Draft>,
  matters: {} as Record<string, Matter>,
}));

vi.mock("@/lib/store", () => ({
  useDraftStore: (selector: (s: { drafts: Record<string, Draft>; matters: Record<string, Matter> }) => unknown) =>
    selector({ drafts: storeMock.drafts, matters: storeMock.matters }),
}));

import { FailingCheckDrillDown } from "./FailingCheckDrillDown";

function makeDraft(overrides: Partial<Draft>): Draft {
  const base: Partial<Draft> = {
    id: "draft_clean",
    mode: "employer",
    letterType: "termination" as Draft["letterType"],
    context: {
      mode: "employer",
      jurisdiction: "UK",
      workerClass: "employee",
      letterType: "termination" as Draft["letterType"],
      effectiveDate: "",
      issueDate: "2026-01-01",
      deliveryMethod: "email",
      tone: "formal",
      confidentiality: "private_and_confidential",
      counselReviewRequired: false,
      riskFlags: {
        protectedStatus: false,
        grievanceLast90Days: false,
        collectiveConsultation: false,
      },
    } as Draft["context"],
    employer: {
      legalName: "Acme Ltd",
      address: "",
      hasLetterhead: false,
    } as Draft["employer"],
    employee: {
      legalName: "Jane Doe",
      jobTitle: "Engineer",
      address: "",
      startDate: "",
      serviceMonths: 0,
    } as Draft["employee"],
    answers: { signatoryName: "HR" } as Draft["answers"],
    // Body that passes word-count + has the disclaimer block + no placeholders.
    sections: [
      {
        id: "sec_1",
        sectionId: "opening",
        title: "Intro",
        html:
          "<p>" +
          "This is a long enough paragraph to satisfy the word-count rule for a termination letter ".repeat(30) +
          "</p><hr/><p>This letter is confidential and sent without prejudice.</p>",
        required: true,
        status: "ready",
        versions: [],
      },
    ] as Draft["sections"],
    reviewStatus: "approved",
    createdAt: 1_700_000_000_000,
    updatedAt: Date.now(), // very recent → unapproved-7d won't trip
  };
  return { ...(base as Draft), ...overrides } as Draft;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/reports/checks/:checkId" element={<FailingCheckDrillDown />} />
        <Route path="/editor/:draftId" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>
  );
}

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="location">{loc.pathname}</div>;
}

/* =========================================================================
 * Layer 1 — predicate invariants
 * ======================================================================= */

describe("HEALTH_CHECKS predicates", () => {
  it("exports a non-empty, unique list of checks", () => {
    expect(HEALTH_CHECKS.length).toBeGreaterThan(0);
    const ids = HEALTH_CHECKS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of HEALTH_CHECKS) {
      expect(c.label.length).toBeGreaterThan(0);
      expect(c.description.length).toBeGreaterThan(0);
      expect(typeof c.predicate).toBe("function");
    }
  });

  it("clean draft passes every predicate", () => {
    const clean = makeDraft({ id: "clean" });
    for (const c of HEALTH_CHECKS) {
      expect(c.predicate(clean)).toBeNull();
    }
  });

  it("missing-disclaimer predicate trips a draft with no <hr> + disclaimer", () => {
    const draft = makeDraft({
      id: "no_disc",
      sections: [
        {
          id: "sec_1",
          sectionId: "opening",
          title: "Intro",
          html: "<p>" + "Body text without any disclaimer block at all ".repeat(40) + "</p>",
          required: true,
          status: "ready",
          versions: [],
        },
      ] as Draft["sections"],
    });
    const reason = HEALTH_CHECKS.find((c) => c.id === "missing-disclaimer")!.predicate(draft);
    expect(reason).toBeTruthy();
    expect(reason).toMatch(/disclaimer/i);
  });

  it("unapproved-7d predicate trips a stale unapproved draft", () => {
    const tenDaysAgo = Date.now() - 10 * 24 * 60 * 60 * 1000;
    const stale = makeDraft({
      id: "stale",
      reviewStatus: "draft",
      updatedAt: tenDaysAgo,
    });
    const reason = HEALTH_CHECKS.find((c) => c.id === "unapproved-7d")!.predicate(stale);
    expect(reason).toBeTruthy();
    expect(reason).toMatch(/no approval recorded/);
  });

  it("unapproved-7d honors its \">7d\" label at the 7/8-day boundary", () => {
    const pred = HEALTH_CHECKS.find((c) => c.id === "unapproved-7d")!.predicate;
    // Same time-of-day N days ago → exactly N calendar days (matches how the
    // other cases in this file construct stale drafts).
    const daysAgo = (n: number) => Date.now() - n * 24 * 60 * 60 * 1000;
    // Exactly 7 days ago → NOT flagged (label/description say "more than a week").
    expect(
      pred(makeDraft({ id: "seven", reviewStatus: "draft", updatedAt: daysAgo(7) }))
    ).toBeNull();
    // 8 days ago → flagged.
    expect(
      pred(makeDraft({ id: "eight", reviewStatus: "draft", updatedAt: daysAgo(8) }))
    ).toBeTruthy();
  });

  it("unresolved-placeholders predicate trips a draft with [placeholder] tokens", () => {
    const draft = makeDraft({
      id: "ph",
      sections: [
        {
          id: "sec_1",
          sectionId: "opening",
          title: "Intro",
          html:
            "<p>Dear [employee_name], your [date] is approaching. " +
            "Filler text to push word-count past the lower bound ".repeat(20) +
            "</p><hr/><p>Confidential — without prejudice.</p>",
          required: true,
          status: "ready",
          versions: [],
        },
      ] as Draft["sections"],
    });
    const reason = HEALTH_CHECKS.find((c) => c.id === "unresolved-placeholders")!.predicate(draft);
    expect(reason).toBeTruthy();
    expect(reason).toMatch(/placeholder/);
    expect(reason).toMatch(/employee_name|date/);
  });

  it("pii-leak predicate trips an NI-number body", () => {
    const draft = makeDraft({
      id: "pii",
      sections: [
        {
          id: "sec_1",
          sectionId: "opening",
          title: "Intro",
          html:
            "<p>Your NI number is AB123456C. " +
            "Some additional filler so word-count clears ".repeat(20) +
            "</p><hr/><p>Confidential — without prejudice.</p>",
          required: true,
          status: "ready",
          versions: [],
        },
      ] as Draft["sections"],
    });
    const reason = HEALTH_CHECKS.find((c) => c.id === "pii-leak")!.predicate(draft);
    expect(reason).toBeTruthy();
    expect(reason).toMatch(/PII pattern/);
  });

  it("empty-sections predicate trips a draft with empty sections", () => {
    const draft = makeDraft({
      id: "empty",
      sections: [
        {
          id: "sec_1",
          sectionId: "opening",
          title: "Intro",
          html: "",
          required: true,
          status: "empty",
          versions: [],
        },
      ] as Draft["sections"],
    });
    const reason = HEALTH_CHECKS.find((c) => c.id === "empty-sections")!.predicate(draft);
    expect(reason).toBeTruthy();
    expect(reason).toMatch(/section/);
  });

  it("missing-parties predicate trips when recipient or sender is absent", () => {
    const draft = makeDraft({
      id: "noparties",
      employer: { legalName: "", address: "", hasLetterhead: false } as Draft["employer"],
      employee: {
        legalName: "",
        jobTitle: "",
        address: "",
        startDate: "",
        serviceMonths: 0,
      } as Draft["employee"],
      answers: {} as Draft["answers"],
    });
    const reason = HEALTH_CHECKS.find((c) => c.id === "missing-parties")!.predicate(draft);
    expect(reason).toBeTruthy();
    expect(reason).toMatch(/recipient|sender/);
  });

  it("broken-evidence-refs predicate trips on [See Fig N] without matching evidence", () => {
    const draft = makeDraft({
      id: "broken_ev",
      evidence: [],
      sections: [
        {
          id: "sec_1",
          sectionId: "opening",
          title: "Intro",
          html:
            "<p>See [See Fig 3] for context. " +
            "Filler to clear word count ".repeat(20) +
            "</p><hr/><p>Confidential — without prejudice.</p>",
          required: true,
          status: "ready",
          versions: [],
        },
      ] as Draft["sections"],
    });
    const reason = HEALTH_CHECKS.find((c) => c.id === "broken-evidence-refs")!.predicate(draft);
    expect(reason).toBeTruthy();
    expect(reason).toMatch(/Fig/);
  });

  it("failingDraftsForCheck returns only failing drafts, with non-empty reasons", () => {
    const clean = makeDraft({ id: "clean" });
    const stale = makeDraft({
      id: "stale",
      reviewStatus: "draft",
      updatedAt: Date.now() - 30 * 24 * 60 * 60 * 1000,
    });
    const rows = failingDraftsForCheck([clean, stale], "unapproved-7d");
    expect(rows).toHaveLength(1);
    expect(rows[0].draft.id).toBe("stale");
    expect(rows[0].reason.length).toBeGreaterThan(0);
  });
});

/* =========================================================================
 * Layer 2 — component rendering + wiring
 * ======================================================================= */

describe("FailingCheckDrillDown", () => {
  beforeEach(() => {
    storeMock.drafts = {};
    storeMock.matters = {};
  });

  it("renders header + only the failing drafts with their reasons", () => {
    storeMock.matters = {
      m1: {
        id: "m1",
        name: "Acme grievance",
        mode: "employer",
        status: "active",
        color: "amber",
        createdAt: 0,
        updatedAt: 0,
      } as Matter,
    };
    storeMock.drafts = {
      clean: makeDraft({ id: "clean", title: "Clean letter" }),
      stale: makeDraft({
        id: "stale",
        title: "Stale letter",
        matterId: "m1",
        reviewStatus: "draft",
        updatedAt: Date.now() - 20 * 24 * 60 * 60 * 1000,
      }),
    };

    renderAt("/reports/checks/unapproved-7d");

    expect(screen.getByText("Not approved for over 7 days")).toBeInTheDocument();
    expect(screen.getByTestId("failing-count")).toHaveTextContent("1 failing");
    expect(screen.getByText("Stale letter")).toBeInTheDocument();
    expect(screen.queryByText("Clean letter")).not.toBeInTheDocument();
    // Matter name is shown in the row.
    expect(screen.getByText("Acme grievance")).toBeInTheDocument();
    // The "Reason this letter is failing" column gives the reason in plain words.
    expect(screen.getByText(/^Not approved\. Last edited .+, \d+ days ago$/)).toBeInTheDocument();
    expect(screen.queryByText(/no approval recorded/i)).not.toBeInTheDocument();
  });

  it("shows the 'no failures' empty state when nothing is failing", () => {
    storeMock.drafts = {
      clean: makeDraft({ id: "clean", title: "Clean letter" }),
    };
    renderAt("/reports/checks/missing-disclaimer");
    expect(screen.getByText("No letters failing this check")).toBeInTheDocument();
  });

  it("shows 'check not found' for an unknown check id", () => {
    renderAt("/reports/checks/does-not-exist");
    expect(screen.getByText("Check not found")).toBeInTheDocument();
  });

  it("filters out template-source drafts from the failing list", () => {
    storeMock.drafts = {
      stale: makeDraft({
        id: "stale",
        title: "Real stale",
        reviewStatus: "draft",
        updatedAt: Date.now() - 20 * 24 * 60 * 60 * 1000,
      }),
      tpl_stale: makeDraft({
        id: "tpl_stale",
        title: "Template stale",
        reviewStatus: "draft",
        updatedAt: Date.now() - 20 * 24 * 60 * 60 * 1000,
        isTemplateSource: true,
      }),
    };
    renderAt("/reports/checks/unapproved-7d");
    expect(screen.getByText("Real stale")).toBeInTheDocument();
    expect(screen.queryByText("Template stale")).not.toBeInTheDocument();
    expect(screen.getByTestId("failing-count")).toHaveTextContent("1 failing");
  });

  it("an advisory rule is not shown in red, and a letter with no matter says so as on Letters", () => {
    storeMock.drafts = {
      stale: makeDraft({
        id: "stale",
        title: "Loose letter",
        reviewStatus: "draft",
        updatedAt: Date.now() - 20 * 24 * 60 * 60 * 1000,
      }),
    };
    renderAt("/reports/checks/unapproved-7d");
    const pill = screen.getByTestId("failing-count").firstElementChild as HTMLElement;
    expect(pill).toHaveTextContent("1 failing");
    expect(pill.className).not.toMatch(/ds-red/);
    const reason = screen.getByText(/^Not approved\. Last edited/);
    expect(reason.className).not.toMatch(/ds-red/);
    expect(screen.getByText("No matter")).toBeInTheDocument();
    expect(screen.queryByText("Unfiled")).not.toBeInTheDocument();
  });

  it("navigates to /editor/:id when a row is clicked", () => {
    storeMock.drafts = {
      stale: makeDraft({
        id: "stale",
        title: "Stale letter",
        reviewStatus: "draft",
        updatedAt: Date.now() - 30 * 24 * 60 * 60 * 1000,
      }),
    };
    renderAt("/reports/checks/unapproved-7d");

    const row = screen.getByRole("button", { name: /Open Stale letter/ });
    fireEvent.click(row);
    expect(screen.getByTestId("location")).toHaveTextContent("/editor/stale");
  });

  it("supports keyboard activation (Enter) on rows", () => {
    storeMock.drafts = {
      stale: makeDraft({
        id: "stale",
        title: "Keyboard stale",
        reviewStatus: "draft",
        updatedAt: Date.now() - 30 * 24 * 60 * 60 * 1000,
      }),
    };
    renderAt("/reports/checks/unapproved-7d");

    const row = screen.getByRole("button", { name: /Open Keyboard stale/ });
    row.focus();
    fireEvent.keyDown(row, { key: "Enter" });
    expect(screen.getByTestId("location")).toHaveTextContent("/editor/stale");
  });
});
