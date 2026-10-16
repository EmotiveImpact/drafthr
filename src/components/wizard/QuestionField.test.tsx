/**
 * QuestionField: the yes/no switch's tap target and where help text sits.
 */
import { useState } from "react";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { Question } from "@/lib/letters/questions";
import { QuestionField, isShortHelp } from "./QuestionField";

function Harness({ q, initial }: { q: Question; initial?: unknown }) {
  const [value, setValue] = useState<unknown>(initial);
  return <QuestionField q={q} value={value} onChange={setValue} />;
}

const flag: Question = {
  id: "protectedStatus",
  type: "boolean",
  label: "Is the employee currently in a legally protected situation?",
  help: "Pregnancy, parental leave, long-term sickness, whistleblower, trade union representative, current grievance.",
};

describe("QuestionField boolean", () => {
  it("keeps the question as the switch's name and a 36px tall tap target", () => {
    render(<Harness q={flag} />);
    const sw = screen.getByRole("switch", { name: flag.label });
    expect(sw.className).toContain("data-[size=default]:h-9");
    // The Yes/No word sits inside the same label, so it enlarges the hit area.
    const label = sw.closest("label");
    expect(label).not.toBeNull();
    expect(label?.getAttribute("for")).toBe(sw.id);
    expect(label?.className).toContain("min-h-9");
  });

  it("toggles once when the Yes/No word is tapped", () => {
    render(<Harness q={flag} />);
    const sw = screen.getByRole("switch", { name: flag.label });
    expect(sw).toHaveAttribute("aria-checked", "false");
    fireEvent.click(screen.getByText("No"));
    expect(sw).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("Yes")).toBeInTheDocument();
    fireEvent.click(sw);
    expect(sw).toHaveAttribute("aria-checked", "false");
  });
});

describe("QuestionField help", () => {
  it("treats a one-line hint as short and a sentence of help as long", () => {
    expect(isShortHelp("6 days over 4 occasions in the last 8 weeks")).toBe(true);
    expect(isShortHelp(flag.help!)).toBe(false);
  });

  it("puts long help under the label, left-aligned, and a short hint beside it", () => {
    const { unmount } = render(<Harness q={flag} />);
    const long = screen.getByText(flag.help!);
    expect(long.className).not.toContain("sm:text-right");
    expect(long.parentElement?.className).not.toContain("sm:flex-row");
    unmount();

    const hinted: Question = { id: "absenceDays", type: "text", label: "Days absent", help: "6 days over 4 occasions" };
    render(<Harness q={hinted} />);
    const short = screen.getByText("6 days over 4 occasions");
    expect(short.className).toContain("sm:text-right");
    expect(short.parentElement?.className).toContain("sm:flex-row");
  });
});
