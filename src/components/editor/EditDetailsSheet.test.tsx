import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import type { Draft } from "@/lib/letters/types";
import { EditDetailsSheet } from "./EditDetailsSheet";

/* ============================================================================
 * Regression: EditDetailsSheet must not discard in-progress edits when the
 * draft mutates in the background (e.g. a streaming regeneration bumping
 * updatedAt produces a new `draft` reference). The seed effect keys on
 * `draft.id`, so an unrelated store update while the sheet is open must leave
 * the user's typing intact.
 * ==========================================================================*/

vi.mock("@/lib/store", () => ({
  useDraftStore: (selector: (s: { patchDraft: () => void }) => unknown) =>
    selector({ patchDraft: () => {} }),
}));

function makeDraft(overrides: Partial<Draft> = {}): Draft {
  return {
    id: "draft_1",
    mode: "employer",
    context: {
      jurisdiction: "UK",
      ukRegion: "England & Wales",
      usState: undefined,
      workerClass: "employee",
      tone: "neutral",
      employeeTone: "assertive",
      effectiveDate: "",
      issueDate: "",
    },
    employer: { legalName: "Acme Ltd", address: "1 High St" },
    employee: {
      legalName: "Jane Doe",
      jobTitle: "Engineer",
      address: "2 Low St",
      startDate: "",
    },
    updatedAt: 1,
    ...overrides,
  } as unknown as Draft;
}

describe("EditDetailsSheet", () => {
  it("preserves in-progress edits when the draft updates in the background", () => {
    const { rerender } = render(
      <EditDetailsSheet open onOpenChange={() => {}} draft={makeDraft()} />
    );

    const nameInput = () =>
      screen.getByLabelText("Full legal name") as HTMLInputElement;
    expect(nameInput().value).toBe("Jane Doe");

    fireEvent.change(nameInput(), { target: { value: "Jane Smith" } });
    expect(nameInput().value).toBe("Jane Smith");

    // Background store mutation: SAME draft id, new object reference + bumped
    // updatedAt (as a streaming appendToSection would produce).
    rerender(
      <EditDetailsSheet
        open
        onOpenChange={() => {}}
        draft={makeDraft({ updatedAt: 2 })}
      />
    );

    // The edit must survive — the seed effect keys on draft.id, not identity.
    expect(nameInput().value).toBe("Jane Smith");
  });

  it("re-seeds when a different draft is opened", () => {
    const { rerender } = render(
      <EditDetailsSheet open onOpenChange={() => {}} draft={makeDraft()} />
    );
    const nameInput = () =>
      screen.getByLabelText("Full legal name") as HTMLInputElement;
    expect(nameInput().value).toBe("Jane Doe");

    // Switching to a genuinely different draft (new id) should reseed.
    rerender(
      <EditDetailsSheet
        open
        onOpenChange={() => {}}
        draft={makeDraft({
          id: "draft_2",
          employee: {
            legalName: "Sam Roe",
            jobTitle: "Analyst",
            address: "3 Mid St",
            startDate: "",
          },
        } as Partial<Draft>)}
      />
    );
    expect(nameInput().value).toBe("Sam Roe");
  });
});
