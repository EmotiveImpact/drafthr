import { describe, it, expect } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { useSearchPalette } from "./SearchPalette";

/* ============================================================================
 * useSearchPalette — the global Cmd/Ctrl+K shortcut must NOT hijack the key
 * while the user is typing in a form field / comment composer (it would steal
 * focus mid-sentence). It should still open from non-text contexts.
 * ==========================================================================*/

function Harness() {
  const { open } = useSearchPalette();
  return (
    <div>
      <span data-testid="state">{open ? "open" : "closed"}</span>
      <textarea data-testid="ta" />
      <input data-testid="inp" />
      <button data-testid="btn">x</button>
    </div>
  );
}

function pressCmdK() {
  act(() => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true })
    );
  });
}

describe("useSearchPalette Cmd+K guard", () => {
  it("does NOT open while a textarea (comment composer) is focused", () => {
    render(<Harness />);
    (screen.getByTestId("ta") as HTMLTextAreaElement).focus();
    pressCmdK();
    expect(screen.getByTestId("state").textContent).toBe("closed");
  });

  it("does NOT open while an input is focused", () => {
    render(<Harness />);
    (screen.getByTestId("inp") as HTMLInputElement).focus();
    pressCmdK();
    expect(screen.getByTestId("state").textContent).toBe("closed");
  });

  it("opens when focus is not in a text field", () => {
    render(<Harness />);
    (screen.getByTestId("btn") as HTMLButtonElement).focus();
    pressCmdK();
    expect(screen.getByTestId("state").textContent).toBe("open");
  });
});
