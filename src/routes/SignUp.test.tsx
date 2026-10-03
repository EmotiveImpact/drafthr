import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CheckYourEmail, SignUp } from "./SignUp";
vi.mock("./SignIn", () => ({ SignIn: ({ screenHint }: { screenHint: string }) => <div>Hosted {screenHint}</div> }));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ refresh: vi.fn() }) }));
afterEach(() => vi.restoreAllMocks());
function Location() { const l = useLocation(); return <div data-testid="location">{l.pathname + l.search}</div>; }
function show() {
  render(<MemoryRouter initialEntries={["/verify"]}><Routes>
    <Route path="/verify" element={<CheckYourEmail email="person@example.test" userId="user_1" />} />
    <Route path="*" element={<Location />} />
  </Routes></MemoryRouter>);
}
describe("registration and legacy verification", () => {
  it("uses the same hosted flow for registration", () => {
    render(<SignUp />);
    expect(screen.getByText("Hosted sign-up")).toBeInTheDocument();
  });
  it("keeps incomplete verification codes disabled", () => {
    show();
    expect(screen.getByRole("button", { name: "Verify email" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Verification code"), { target: { value: "123" } });
    expect(screen.getByRole("button", { name: "Verify email" })).toBeDisabled();
  });
  it("returns a verified address through WorkOS instead of assuming authentication", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ok: true, requiresSignIn: true })));
    show();
    fireEvent.change(screen.getByLabelText("Verification code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify email" }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/sign-in?redirect=%2F"));
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/verify-email", expect.objectContaining({
      body: JSON.stringify({ code: "123456", userId: "user_1" }),
    }));
  });
  it("still resends codes for outstanding verification links", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    show();
    fireEvent.click(screen.getByRole("button", { name: "Didn't get a code? Resend" }));
    await screen.findByRole("button", { name: "Sent — check your inbox" });
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/resend-verification", expect.objectContaining({ body: JSON.stringify({ email: "person@example.test" }) }));
  });
  it("shows an invalid-code error without treating it as a session", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: "Code expired" }), { status: 400 }));
    show();
    fireEvent.change(screen.getByLabelText("Verification code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify email" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Code expired");
  });
});
