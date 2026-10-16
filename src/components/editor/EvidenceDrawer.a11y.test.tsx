import { useState } from "react";
import { describe, expect, it, beforeAll } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MotionGlobalConfig } from "framer-motion";
import { EvidenceDrawer } from "./EvidenceDrawer";
import type { Draft } from "@/lib/letters/types";

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});

const draft = {
  id: "d1",
  mode: "employer",
  letterType: "warning",
  context: { jurisdiction: "UK" },
  employer: {},
  employee: {},
  answers: {},
  sections: [{ id: "s1", sectionId: "body", title: "Body", html: "<p>x</p>", required: true, status: "ready", versions: [] }],
  evidence: [
    { id: "e1", kind: "email", filename: "warning-email.eml", content: "Email", displayMode: "figure", uploadedAt: 1 },
  ],
  createdAt: 0,
  updatedAt: 0,
} as unknown as Draft;

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <MemoryRouter>
      <button type="button" onClick={() => setOpen(true)}>
        Open evidence
      </button>
      <EvidenceDrawer draft={draft} editor={null} open={open} onOpenChange={setOpen} />
    </MemoryRouter>
  );
}

describe("EvidenceDrawer (floating) is an accessible modal dialog", () => {
  it("is labelled, modal, takes focus, traps Tab, closes on Escape and returns focus", async () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Open evidence" });
    trigger.focus();
    await act(async () => {
      fireEvent.click(trigger);
    });

    const dialog = await screen.findByRole("dialog", { name: "Insert evidence" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    // Focus moved inside the dialog.
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

    // The page behind is hidden from assistive tech while open.
    expect(trigger.closest("[aria-hidden='true']")).not.toBeNull();

    // Tab from the last focusable element wraps inside the dialog.
    const focusables = dialog.querySelectorAll<HTMLElement>("button:not([disabled]), input, a[href]");
    const last = focusables[focusables.length - 1];
    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(dialog.contains(document.activeElement)).toBe(true);

    // Escape closes it and focus goes back to the trigger.
    await act(async () => {
      fireEvent.keyDown(document.activeElement ?? dialog, { key: "Escape" });
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("closes from its close button", async () => {
    render(<Harness />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Open evidence" }));
    });
    const dialog = await screen.findByRole("dialog");
    await act(async () => {
      fireEvent.click(
        Array.from(dialog.querySelectorAll("button")).find(
          (b) => b.getAttribute("aria-label") === "Close evidence drawer",
        )!,
      );
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("pinned mode renders as a labelled region, not a dialog", () => {
    render(
      <MemoryRouter>
        <button type="button">Outside</button>
        <EvidenceDrawer draft={draft} editor={null} open onOpenChange={() => {}} pinned />
      </MemoryRouter>,
    );
    // The Editor mounts the pinned rail with open set: it must still not be a
    // modal, hide the page, or keep focus from leaving it.
    expect(screen.queryByRole("dialog")).toBeNull();
    const outside = screen.getByRole("button", { name: "Outside" });
    expect(outside.closest("[aria-hidden='true']")).toBeNull();
    outside.focus();
    expect(document.activeElement).toBe(outside);
    expect(screen.getByRole("complementary", { name: "Evidence" })).toBeInTheDocument();
  });
});
