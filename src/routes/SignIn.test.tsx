import { StrictMode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignIn } from "./SignIn";
const auth = vi.hoisted(() => ({ user: null as null | { id: string }, isLoaded: true }));
vi.mock("@/lib/auth", () => ({ AUTH_ENABLED: true, useAuth: () => auth }));
const originalLocation = window.location;
const assign = vi.fn();
const fetchMock = vi.fn();
beforeEach(() => {
  auth.user = null; auth.isLoaded = true;
  assign.mockReset(); fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ url: "https://login.example.test/authorize" }), { headers: { "Content-Type": "application/json" } }));
  Object.defineProperty(window, "location", { configurable: true, value: { ...originalLocation, assign } });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
});
function Location() { const l = useLocation(); return <div data-testid="location">{l.pathname + l.search}</div>; }
function show(path = "/sign-in", signup = false) {
  return render(<StrictMode><MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/sign-in" element={<SignIn screenHint={signup ? "sign-up" : "sign-in"} />} />
    <Route path="*" element={<Location />} />
  </Routes></MemoryRouter></StrictMode>);
}
describe("hosted sign-in", () => {
  it("starts one hosted login under StrictMode without collecting credentials", async () => {
    show();
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://login.example.test/authorize"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
  });
  it("carries the invitation destination to the server without storage", async () => {
    show("/sign-in?redirect=" + encodeURIComponent("/signup/workspace?invite=token"));
    await waitFor(() => expect(assign).toHaveBeenCalled());
    const url = new URL(fetchMock.mock.calls[0][0], "http://localhost");
    expect(url.searchParams.get("redirect")).toBe("/signup/workspace?invite=token");
  });
  it("starts organization reauthentication even when the user is already signed in", async () => {
    auth.user = { id: "user" };
    show("/sign-in?workspace=company");
    await waitFor(() => expect(assign).toHaveBeenCalled());
    expect(String(fetchMock.mock.calls[0][0])).toContain("workspace=company");
  });
  it("uses the hosted registration screen", async () => {
    show("/sign-in", true);
    await waitFor(() => expect(assign).toHaveBeenCalled());
    expect(String(fetchMock.mock.calls[0][0])).toContain("screen_hint=sign-up");
  });
  it("keeps logout on a calm confirmation screen instead of logging back in", async () => {
    show("/sign-in?signed_out=1");
    expect(screen.getByRole("status")).toHaveTextContent("signed out");
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Continue to secure sign-in" }));
    await waitFor(() => expect(assign).toHaveBeenCalled());
  });
  it("shows a retryable service error without redirecting", async () => {
    fetchMock.mockResolvedValue(new Response("unavailable", { status: 503 }));
    show();
    expect(await screen.findByRole("alert")).toHaveTextContent("unavailable");
    expect(assign).not.toHaveBeenCalled();
    expect(screen.getByRole("button")).not.toBeDisabled();
  });
  it("does not start another login for an already signed-in personal session", async () => {
    auth.user = { id: "user" };
    show("/sign-in?redirect=%2Fhr");
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/hr"));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
