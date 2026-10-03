import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Privacy } from "./Privacy";
import { Terms } from "./Terms";

afterEach(() => { cleanup(); vi.useRealTimers(); });

it.each([Privacy, Terms])("keeps the legal draft revision fixed and makes pending approval visible", (Page) => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2027-02-20T12:00:00Z"));
  render(<MemoryRouter><Page /></MemoryRouter>);
  expect(screen.getByText(/Not approved for production/)).toBeInTheDocument();
  expect(screen.getByText("3 October 2026")).toBeInTheDocument();
  expect(screen.queryByText(/2027-02-20/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Tribunal-grade/)).not.toBeInTheDocument();
});

it("describes pack signatures conditionally without claiming standalone PDF signing or trusted time", () => {
  render(<MemoryRouter><Terms /></MemoryRouter>);
  expect(screen.getByText(/When signing is configured/)).toHaveTextContent("marked unsigned");
  expect(screen.getByText(/Standalone PDF and DOCX/)).toHaveTextContent("no independently trusted timestamp");
  expect(screen.queryByText(/PAdES-B-T-style/)).not.toBeInTheDocument();
  expect(screen.queryByText(/90-day grace period before automatic purge/)).not.toBeInTheDocument();
});

it("does not promise unverified provider agreements, zero retention or automatic data expiry", () => {
  render(<MemoryRouter><Privacy /></MemoryRouter>);
  expect(screen.getByText(/does not establish that a DPA has been executed/)).toBeInTheDocument();
  expect(screen.getByText(/does not confirm zero retention/)).toBeInTheDocument();
  expect(screen.getByText(/Do not rely on automatic expiry/)).toBeInTheDocument();
  expect(screen.queryByText(/FreeTSA/)).not.toBeInTheDocument();
  expect(screen.queryByText(/auto-purged from active storage/)).not.toBeInTheDocument();
});
