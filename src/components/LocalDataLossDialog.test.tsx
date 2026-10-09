import { describe, it, expect } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import { LocalDataLossDialog } from "./LocalDataLossDialog";
import { confirmLocalDataLoss } from "@/lib/session/localDataGuard";

const summary = {
  items: [
    { label: "2 employees", count: 2 },
    { label: "1 letter", count: 1 },
  ],
  otherWorkspaces: 1,
};

function mount() {
  render(
    <Theme>
      <LocalDataLossDialog />
    </Theme>,
  );
}

describe("LocalDataLossDialog", () => {
  it("lists what would be lost and resolves true only on the destructive choice", async () => {
    mount();
    let decision: Promise<boolean> | undefined;
    act(() => {
      decision = confirmLocalDataLoss("sign-out", summary);
    });
    const list = await screen.findByTestId("local-data-loss-items");
    expect(list.textContent).toMatch(/2 employees/);
    expect(list.textContent).toMatch(/1 letter/);
    expect(list.textContent).toMatch(/1 other workspace/);
    expect(screen.getByRole("button", { name: /download backup/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /sign out and delete/i }));
    await expect(decision).resolves.toBe(true);
  });

  it("resolves false on cancel", async () => {
    mount();
    let decision: Promise<boolean> | undefined;
    act(() => {
      decision = confirmLocalDataLoss("sign-out", summary);
    });
    fireEvent.click(await screen.findByRole("button", { name: /cancel/i }));
    await expect(decision).resolves.toBe(false);
  });
});
