import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Onboarding } from "./Onboarding";
import { useProfileStore } from "@/lib/profile";

function renderOnboarding() {
  return render(
    <MemoryRouter>
      <Onboarding />
    </MemoryRouter>,
  );
}

describe("Onboarding", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useProfileStore.getState().reset();
  });

  afterEach(() => window.localStorage.clear());

  it("does not repeat the canonical role selection", () => {
    useProfileStore.getState().setRole("employer");
    renderOnboarding();

    expect(screen.getByRole("heading", { name: "Where do you operate?" })).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuetext", "Step 1 of 2");
    expect(screen.queryByText("I'm an employer / HR")).not.toBeInTheDocument();
    expect(screen.queryByText("I'm an employee")).not.toBeInTheDocument();
  });

  it("stores employer address and signatory fields in the employer profile", () => {
    useProfileStore.getState().setRole("employer");
    renderOnboarding();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.change(screen.getByLabelText(/Your full name/), { target: { value: "Alex Manager" } });
    fireEvent.change(screen.getByLabelText("Your job title"), { target: { value: "HR Director" } });
    fireEvent.change(screen.getByLabelText("Your company's legal name"), { target: { value: "Acme Ltd" } });
    fireEvent.change(screen.getByLabelText("Company registered address"), { target: { value: "1 High Street" } });
    fireEvent.click(screen.getByRole("button", { name: "Get started" }));

    const profile = useProfileStore.getState().profile;
    expect(profile.employer).toMatchObject({
      legalName: "Acme Ltd",
      address: "1 High Street",
      signatoryName: "Alex Manager",
      signatoryTitle: "HR Director",
    });
    expect(profile.personal.address).toBeUndefined();
    expect(profile.defaults).toMatchObject({
      jurisdiction: "UK",
      ukRegion: "England & Wales",
    });
  });

  it("stores an employee's personal address without overwriting the company address", () => {
    useProfileStore.getState().setRole("employee");
    useProfileStore.getState().patchEmployer({ address: "Company address" });
    renderOnboarding();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.change(screen.getByLabelText(/Your full legal name/), { target: { value: "Jamie Worker" } });
    fireEvent.change(screen.getByLabelText("Your address (for the letter)"), { target: { value: "2 Low Street" } });
    fireEvent.click(screen.getByRole("button", { name: "Get started" }));

    const profile = useProfileStore.getState().profile;
    expect(profile.personal.address).toBe("2 Low Street");
    expect(profile.employer.address).toBe("Company address");
  });

  it("stays closed for returning users and retains their saved role", () => {
    useProfileStore.getState().setRole("employee");
    useProfileStore.getState().markSetupComplete();
    renderOnboarding();

    expect(screen.queryByText("Welcome to DraftHR")).not.toBeInTheDocument();
    expect(useProfileStore.getState().profile.role).toBe("employee");
  });
});
