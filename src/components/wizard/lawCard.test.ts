import { describe, expect, it } from "vitest";
import { rulesFor } from "@/lib/letters/compliance";
import { answersText, lawCardFor } from "./lawCard";

describe("law card on the new letter page", () => {
  it("lists exactly the real compliance rules for the letter, country and state", () => {
    const card = lawCardFor("warning", "UK", {});
    const ids = rulesFor("warning", "UK").map((r) => r.id).sort();
    expect(card.rows.map((r) => r.id).sort()).toEqual(ids);
    expect(card.kicker).toBe("What UK law requires");
  });

  it("uses the ACAS Code heading for UK disciplinary letters only", () => {
    const uk = lawCardFor("warning", "UK", {});
    expect(uk.rows.length).toBeGreaterThan(0);
    expect(uk.heading).toBe("The ACAS Code on disciplinary and grievance procedures");
    expect(uk.footnote).toMatch(/LRA Code/);
    expect(lawCardFor("offer", "UK", {}).heading).toBe("What this letter must cover");
    const us = lawCardFor("warning", "US", {}, "CA");
    expect(us.kicker).toBe("What US law requires");
    expect(us.heading).not.toMatch(/ACAS/);
    expect(us.rows.map((r) => r.id).sort()).toEqual(rulesFor("warning", "US", "CA").map((r) => r.id).sort());
  });

  it("puts required rules before recommended ones and warnings last", () => {
    const order = { required: 0, recommended: 1, warn: 2 } as const;
    const card = lawCardFor("termination", "UK", {});
    const seen = card.rows.map((r) => order[r.severity]);
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
  });

  it("marks clause rules as added by DraftHR until the answers meet them", () => {
    const card = lawCardFor("warning", "UK", {});
    for (const row of card.rows) {
      if (row.severity === "warn") {
        expect(row.state).toBe("flag");
      } else {
        expect(row.state).toBe("add");
        expect(row.note).toBe("DraftHR will add this");
      }
    }
  });

  it("marks a rule as met once the answers cover it", () => {
    const card = lawCardFor("warning", "UK", { notes: "You have the right to appeal within 5 working days." });
    const appeal = card.rows.find((r) => r.id === "uk_warning_appeal");
    expect(appeal?.state).toBe("met");
    expect(appeal?.note).toBe("Covered by your answers");
    expect(card.rows.find((r) => r.id === "uk_warning_accompanied")?.state).toBe("add");
  });

  it("explains when a letter has no specific legal steps", () => {
    const withNone = (["offer", "reference", "resignation", "pay_rise"] as const).find(
      (t) => rulesFor(t as never, "UK").length === 0
    );
    if (!withNone) return;
    const card = lawCardFor(withNone as never, "UK", {});
    expect(card.rows).toEqual([]);
    expect(card.intro).toMatch(/No specific legal steps/);
  });

  it("flattens nested answers into one string and ignores booleans", () => {
    const text = answersText({ a: "Night shift", b: 3, c: true, d: ["x", { e: "y" }], f: null });
    expect(text).toContain("Night shift");
    expect(text).toContain("3");
    expect(text).toContain("x");
    expect(text).toContain("y");
    expect(text).not.toContain("true");
  });
});
