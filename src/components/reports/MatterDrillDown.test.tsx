import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";

import type { Draft, Matter } from "@/lib/letters/types";

/* ============================================================================
 * Tests for MatterDrillDown — /reports/matters/:matterId
 *
 * What we cover:
 *   - Header renders matter name, draft count, people count, risk band
 *   - Drafts in the matter render in the table with severity badges
 *   - Empty state when the matter has no drafts
 *   - Row click navigates to /editor/:id
 *   - Severity badge maps to the right severity ("high" for a draft that
 *     trips a compliance fail, "low" for a clean one)
 *
 * Strategy: mock useDraftStore with a small fixture so the test stays a
 * pure rendering/wiring assertion. Real store behaviour is tested elsewhere.
 * ==========================================================================*/

const storeMock = vi.hoisted(() => ({
  drafts: {} as Record<string, Draft>,
  matters: {} as Record<string, Matter>,
}));

vi.mock("@/lib/store", () => ({
  useDraftStore: (selector: (s: { drafts: Record<string, Draft>; matters: Record<string, Matter> }) => unknown) =>
    selector({ drafts: storeMock.drafts, matters: storeMock.matters }),
}));

// Import AFTER the mock so the component picks up our stubbed store.
import { MatterDrillDown } from "./MatterDrillDown";

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
      address: "1 High St",
      hasLetterhead: false,
    } as Draft["employer"],
    employee: {
      legalName: "Jane Doe",
      jobTitle: "Engineer",
      address: "",
      startDate: "",
      serviceMonths: 0,
    } as Draft["employee"],
    // A "clean" draft — every section ready, no PII, both parties, with
    // a signature and letterhead so checkSignature + checkLetterhead pass.
    answers: {
      signatoryName: "HR Manager",
      hasLetterhead: true,
    } as Draft["answers"],
    sections: [
      {
        id: "sec_1",
        sectionId: "opening",
        title: "Intro",
        html:
          "<p>" +
          "This is a sufficiently long paragraph that should clear the word-count check ".repeat(35) +
          "</p>",
        required: true,
        status: "ready",
        versions: [],
      },
    ] as Draft["sections"],
    matterId: "matter_1",
    createdAt: 1_700_000_000_000,
    updatedAt: 1_768_000_000_000,
  };
  return { ...(base as Draft), ...overrides } as Draft;
}

function makeMatter(overrides: Partial<Matter> = {}): Matter {
  return {
    id: "matter_1",
    name: "Acme grievance 2026",
    mode: "employer",
    status: "active",
    color: "amber",
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...overrides,
  } as Matter;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/reports/matters/:matterId" element={<MatterDrillDown />} />
        <Route path="/editor/:draftId" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>
  );
}

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="location">{loc.pathname}</div>;
}

describe("MatterDrillDown", () => {
  beforeEach(() => {
    storeMock.drafts = {};
    storeMock.matters = {};
  });

  it("renders all drafts in the matter with header context", () => {
    storeMock.matters = { matter_1: makeMatter() };
    storeMock.drafts = {
      draft_a: makeDraft({ id: "draft_a", title: "Final warning — Jane" }),
      draft_b: makeDraft({
        id: "draft_b",
        title: "Stage 2 grievance response",
        employee: {
          legalName: "John Smith",
          jobTitle: "Engineer",
          address: "",
          startDate: "",
          serviceMonths: 0,
        } as Draft["employee"],
      }),
      // A draft in a different matter — must NOT appear in this drill-down.
      draft_other: makeDraft({
        id: "draft_other",
        title: "Unrelated letter",
        matterId: "matter_other",
      }),
    };

    renderAt("/reports/matters/matter_1");

    expect(screen.getByText("Acme grievance 2026")).toBeInTheDocument();
    expect(screen.getByText("Final warning — Jane")).toBeInTheDocument();
    expect(screen.getByText("Stage 2 grievance response")).toBeInTheDocument();
    expect(screen.queryByText("Unrelated letter")).not.toBeInTheDocument();
    // 2 drafts, 2 unique employees rendered in the header chips.
    expect(screen.getByText(/2 drafts/)).toBeInTheDocument();
    expect(screen.getByText(/2 people/)).toBeInTheDocument();
  });

  it("renders the empty state when the matter has no drafts", () => {
    storeMock.matters = { matter_1: makeMatter() };
    storeMock.drafts = {};

    renderAt("/reports/matters/matter_1");

    expect(screen.getByText("No letters for this matter yet")).toBeInTheDocument();
  });

  it("renders 'matter not found' for an unknown matter id", () => {
    storeMock.matters = {};
    renderAt("/reports/matters/does_not_exist");
    expect(screen.getByText("Matter not found")).toBeInTheDocument();
  });

  it("navigates to /editor/:id when a draft row is clicked", () => {
    storeMock.matters = { matter_1: makeMatter() };
    storeMock.drafts = {
      draft_a: makeDraft({ id: "draft_a", title: "Final warning" }),
    };

    renderAt("/reports/matters/matter_1");

    const row = screen.getByRole("button", { name: /Open Final warning/ });
    fireEvent.click(row);

    expect(screen.getByTestId("location")).toHaveTextContent("/editor/draft_a");
  });

  it("maps severity badges to the right severity tier", () => {
    storeMock.matters = { matter_1: makeMatter() };
    storeMock.drafts = {
      // Clean draft — every check passes → low severity.
      draft_clean: makeDraft({ id: "draft_clean", title: "Clean letter" }),
      // PII fail — UK NI number in the body → high severity.
      draft_pii: makeDraft({
        id: "draft_pii",
        title: "PII letter",
        sections: [
          {
            id: "sec_1",
            sectionId: "opening",
            title: "Intro",
            html:
              "<p>" +
              "This sufficiently-long paragraph references the employee's NI number AB123456C in plain text ".repeat(15) +
              "</p>",
            required: true,
            status: "ready",
            versions: [],
          },
        ] as Draft["sections"],
      }),
    };

    renderAt("/reports/matters/matter_1");

    const cleanBadge = screen.getByTestId("severity-draft_clean");
    const piiBadge = screen.getByTestId("severity-draft_pii");
    expect(cleanBadge).toHaveAttribute("data-severity", "low");
    expect(piiBadge).toHaveAttribute("data-severity", "high");
    // Colour: high uses the red token, low uses green.
    expect(piiBadge.getAttribute("style") ?? "").toContain("--ds-red-fg");
    expect(cleanBadge.getAttribute("style") ?? "").toContain("--ds-green-fg");
  });

  it("supports keyboard activation on rows", () => {
    storeMock.matters = { matter_1: makeMatter() };
    storeMock.drafts = {
      draft_a: makeDraft({ id: "draft_a", title: "Keyboard nav letter" }),
    };

    renderAt("/reports/matters/matter_1");

    const row = screen.getByRole("button", { name: /Open Keyboard nav letter/ });
    // Sanity: focusable.
    row.focus();
    expect(row).toHaveFocus();
    fireEvent.keyDown(row, { key: "Enter" });
    expect(screen.getByTestId("location")).toHaveTextContent("/editor/draft_a");
  });

  it("filters out template-source drafts from the matter list", () => {
    storeMock.matters = { matter_1: makeMatter() };
    storeMock.drafts = {
      real: makeDraft({ id: "real", title: "Real letter" }),
      tpl: makeDraft({
        id: "tpl",
        title: "Template source",
        isTemplateSource: true,
      }),
    };

    renderAt("/reports/matters/matter_1");

    expect(screen.getByText("Real letter")).toBeInTheDocument();
    expect(screen.queryByText("Template source")).not.toBeInTheDocument();
    // and the count chip should reflect 1 draft, not 2.
    const headers = screen.getAllByText(/1 draft/);
    expect(headers.length).toBeGreaterThan(0);
    // Sanity: the inner table only contains the real draft as a row button.
    const table = screen.getByRole("table");
    const rowButtons = within(table).getAllByRole("button");
    expect(rowButtons).toHaveLength(1);
  });
});
