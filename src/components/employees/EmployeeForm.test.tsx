import { describe, it, expect } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";

import { EmployeeForm, type EmployeeFormValues } from "./EmployeeForm";

/* ============================================================================
 * Regression test for EmployeeForm — in-progress edits must survive a parent
 * re-render.
 *
 * Callers (e.g. EmployeeDetail) build `initial` as a fresh object literal on
 * every render. If the reset effect keys on `initial`'s identity it re-fires
 * on any unrelated parent re-render and silently wipes the user's edits. The
 * fix gates the reset on the closed→open transition, so a mid-edit parent
 * re-render (with a brand-new `initial` reference) must NOT clobber typing.
 * ==========================================================================*/

function Harness({ initial }: { initial?: Partial<EmployeeFormValues> }) {
  const [, setTick] = useState(0);
  return (
    <>
      <button onClick={() => setTick((t) => t + 1)}>rerender</button>
      <EmployeeForm
        open
        onOpenChange={() => {}}
        // Fresh object literal every render — mirrors EmployeeDetail.
        initial={initial ? { ...initial } : undefined}
        title="Edit employee"
        submitLabel="Save changes"
        onSubmit={() => {}}
      />
    </>
  );
}

describe("EmployeeForm", () => {
  it("preserves in-progress edits across a parent re-render", () => {
    render(<Harness initial={{ legalName: "Jane Patel" }} />);

    const input = screen.getByPlaceholderText("Jane Patel") as HTMLInputElement;
    expect(input.value).toBe("Jane Patel");

    fireEvent.change(input, { target: { value: "Jane Patel-Smith" } });
    expect(input.value).toBe("Jane Patel-Smith");

    // Force a parent re-render, which hands EmployeeForm a NEW `initial` ref.
    fireEvent.click(screen.getByText("rerender"));

    // The edit must survive — the reset should only run on open transitions.
    expect(
      (screen.getByPlaceholderText("Jane Patel") as HTMLInputElement).value,
    ).toBe("Jane Patel-Smith");
  });

  it("resets to the provided initial when reopened", () => {
    function ReopenHarness() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <button onClick={() => setOpen((o) => !o)}>toggle</button>
          <EmployeeForm
            open={open}
            onOpenChange={setOpen}
            initial={{ legalName: "Original Name" }}
            title="Edit employee"
            submitLabel="Save changes"
            onSubmit={() => {}}
          />
        </>
      );
    }
    render(<ReopenHarness />);

    const input = () =>
      screen.getByPlaceholderText("Jane Patel") as HTMLInputElement;
    expect(input().value).toBe("Original Name");

    fireEvent.change(input(), { target: { value: "Edited Away" } });
    expect(input().value).toBe("Edited Away");

    // Close then reopen — a genuine new invocation should reset to `initial`.
    fireEvent.click(screen.getByText("toggle")); // close
    fireEvent.click(screen.getByText("toggle")); // reopen

    expect(input().value).toBe("Original Name");
  });
});
