import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { CheckList, CheckRow } from "./CheckRow";

/** MINOR (round 4): the amber mark is drawn, never a typed "!" read aloud. */
describe("CheckRow", () => {
  it("draws the needs-you mark and says the state in words", () => {
    const { container } = render(
      <CheckList label="Before review">
        <CheckRow state="need">7 of 9 checks pass</CheckRow>
      </CheckList>
    );
    const row = container.querySelector('[data-slot="check-row"]')!;
    expect(row.textContent).not.toContain("!");
    const mark = row.querySelector('[data-slot="attention-mark"]');
    expect(mark).not.toBeNull();
    expect(mark!.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(row.querySelector(".sr-only")?.textContent).toContain("needs you");
  });
});
