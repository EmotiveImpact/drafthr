import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DeadlineBanner } from "./DeadlineBanner";
import { buildRailRows } from "./ReviewRail";
import { useDraftStore } from "@/lib/store";
import type { Draft } from "@/lib/letters/types";

beforeEach(() => useDraftStore.setState({ drafts: {}, matters: {}, employees: {} }));
afterEach(cleanup);
function makeDraft(jurisdiction: "UK" | "US", letterType: Draft["letterType"] = "acas_ec_notification") {
  const id = useDraftStore.getState().createDraft(letterType, { jurisdiction }, "employee");
  return useDraftStore.getState().drafts[id];
}
function deadlineCheck(draft: Draft) {
  return buildRailRows({ draft, unresolvedComments: 0, onJumpToSection: () => {}, onJumpToEvidence: () => {} }).find(r => r.id === "deadline");
}

describe("editor filing-deadline warnings", () => {
  it.each(["UK", "US"] as const)("keeps a visible warning for a new %s claim without an invented date", (jurisdiction) => {
    const draft = makeDraft(jurisdiction);
    render(<DeadlineBanner draft={draft} />);
    expect(screen.getByText("Check your filing deadline.")).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent("does not calculate legal filing deadlines");
    expect(deadlineCheck(draft)).toMatchObject({ label: "Filing deadline not verified", status: "warn" });
    expect(screen.getByRole("link")).toHaveAttribute("href", jurisdiction === "UK" ? "https://www.acas.org.uk/employment-tribunal-time-limits" : "https://www.eeoc.gov/time-limits-filing-charge");
    if (jurisdiction === "US") expect(screen.getByRole("note")).not.toHaveTextContent(/Acas/i);
  });

  it.each(["2020-01-01", "2040-12-31"])("never calls a historical reminder %s verified, expired or legally safe", (iso) => {
    const draft = makeDraft("UK");
    draft.context.protectedDeadline = { iso, basis: "Automatic legal calculation: 3 months less one day" };
    render(<DeadlineBanner draft={draft} />);
    expect(screen.getByRole("note")).toHaveTextContent("Unverified reminder");
    expect(screen.getByRole("note")).not.toHaveTextContent(/limitation has passed|3 months|6 weeks|Tribunal deadline/);
    expect(deadlineCheck(draft)).toMatchObject({ status: "warn" });
    expect(deadlineCheck(draft)?.detail).toContain("Unverified reminder");
  });

  it("omits routine-letter warnings but shows them when an incident date is recorded", () => {
    const draft = makeDraft("UK", "holiday_request");
    const { rerender } = render(<DeadlineBanner draft={draft} />);
    expect(screen.queryByRole("note")).toBeNull();
    expect(deadlineCheck(draft)).toBeUndefined();
    draft.answers.actDate = "2026-10-01";
    rerender(<DeadlineBanner draft={draft} />);
    expect(screen.getByRole("note")).toHaveTextContent("Check your filing deadline");
    expect(deadlineCheck(draft)?.status).toBe("warn");
  });
});
