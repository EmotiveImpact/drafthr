import { beforeAll, describe, it, expect } from "vitest";
import { render, screen, act, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SearchPalette, useSearchPalette } from "./SearchPalette";
import { useDraftStore } from "@/lib/store";
import { useProfileStore } from "@/lib/profile";
import { letterCatalogByMode } from "@/lib/letters/catalog";

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

/* ============================================================================
 * The Letters heading counts the letters listed for what was typed
 * (FOUNDATION-X2), and the old Exported page is offered as "Sent letters"
 * (FOUNDATION-X3).
 * ==========================================================================*/

beforeAll(() => {
  // cmdk measures its list and scrolls the selected row into view; jsdom has neither.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= function () {};
});

function seedLetters(names: string[]) {
  const types = letterCatalogByMode("employer");
  const offer = types.find((t) => t.id === "offer") ?? types[0];
  const other = types.find((t) => t.id !== offer.id) ?? types[1];
  useDraftStore.setState({ drafts: {} });
  names.forEach((name, i) => {
    useDraftStore
      .getState()
      .createDraft(i === 0 ? offer.id : other.id, { employeeLegalName: name, jurisdiction: "UK" }, "employer");
  });
  return { offer, other };
}

function renderPalette() {
  useProfileStore.getState().setRole("employer");
  return render(
    <MemoryRouter initialEntries={["/hr"]}>
      <SearchPalette open onOpenChange={() => {}} />
    </MemoryRouter>
  );
}

function lettersHeading(): string {
  const heading = [...document.querySelectorAll("[cmdk-group-heading]")].find((h) => /^Letters/.test(h.textContent ?? ""));
  return heading?.textContent ?? "";
}

describe("SearchPalette letters group", () => {
  it("counts only the letters that match what was typed", () => {
    const { offer } = seedLetters(["Priya Shah", "Tom Ellis", "Sam Patel", "Maya Okafor"]);
    renderPalette();
    expect(lettersHeading()).toBe("Letters (4)");
    const input = screen.getByPlaceholderText("Search letters, letter types or pages");
    fireEvent.change(input, { target: { value: offer.shortTitle.split(" ")[0] } });
    const heading = lettersHeading();
    const group = [...document.querySelectorAll("[cmdk-group]")].find((g) => g.querySelector("[cmdk-group-heading]")?.textContent === heading)!;
    const rows = within(group as HTMLElement).getAllByRole("option");
    expect(heading).toBe(`Letters (${rows.length})`);
    expect(rows.length).toBe(1);
  });

  it("says how many match when more than eight do", () => {
    seedLetters(Array.from({ length: 11 }, (_, i) => `Person ${i}`));
    renderPalette();
    expect(lettersHeading()).toBe("Letters (8 of 11)");
  });

  it("lists the Sent tab of Letters, not the old Exported page", () => {
    seedLetters(["Priya Shah"]);
    renderPalette();
    expect(screen.getByRole("option", { name: /Sent letters/ })).toBeTruthy();
    expect(screen.queryByRole("option", { name: /^Exported$/ })).toBeNull();
  });
});
