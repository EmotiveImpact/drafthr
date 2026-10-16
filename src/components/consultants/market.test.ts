import { describe, expect, it } from "vitest";
import { NO_FILTERS, availabilityPill, declinedLine, describeForLetter, priorityPriceOf } from "./market";
import { openReviewNote } from "./letters";
import type { Consultant } from "./types";
import type { ReviewRequest } from "@/lib/journey/reviews";

const NOW = new Date("2026-10-13T09:00:00Z").getTime();
const expert = (over: Partial<Consultant> = {}) =>
  ({ name: "Sarah Whitfield", initials: "SW", role: "Employment solicitor", specialties: [], price: 180, sla: "48h", rating: 4.9, reviews: 12, profileId: "p1", availability: "this_week", ...over }) as Consultant;

describe("describeForLetter", () => {
  it("ends the count's sentence before the best-match note when no filter is on (MARKET-X1)", () => {
    expect(describeForLetter({ ...NO_FILTERS }, 8, "best", null)).toBe(". Your top 3 match comes first.");
  });
  it("continues the count with the filters, then the note", () => {
    expect(describeForLetter({ ...NO_FILTERS, specialties: ["Disciplinary"] }, 6, "best", null)).toBe(
      "for disciplinary letters. Your top 3 match comes first.",
    );
  });
  it("says nothing extra without filters or best-match sort", () => {
    expect(describeForLetter({ ...NO_FILTERS }, 8, "rating", null)).toBe("");
  });
});

describe("availabilityPill when the deadline can't be met (MARKET-049)", () => {
  const due = NOW + 20 * 3600_000;
  it("keeps the flag short enough for one line", () => {
    const p = availabilityPill(expert({ availability: "three_four_weeks" }), due, NOW);
    expect(p).toEqual({ label: "In 3 to 4 weeks, after your deadline", tone: "late" });
    expect(p.label.length).toBeLessThanOrEqual(36);
  });
  it("flags a slow turnaround", () => {
    expect(availabilityPill(expert({ sla: "3-5 days" }), due, NOW)).toEqual({ label: "Back after your deadline", tone: "late" });
  });
  it("keeps green for someone who can make it", () => {
    expect(availabilityPill(expert({ sla: "24h" }), NOW + 3 * 86400_000, NOW).tone).toBe("live");
  });
});

describe("declinedLine (MARKET-095)", () => {
  it("names the date and the reason", () => {
    expect(declinedLine({ declinedAt: new Date("2026-10-09T10:00:00Z").getTime(), responseNote: "At capacity this month." }, NOW)).toBe(
      "Declined 9 Oct: At capacity this month.",
    );
  });
  it("leaves out what it doesn't know", () => {
    expect(declinedLine({ responseNote: "At capacity" }, NOW)).toBe("Declined: At capacity.");
    expect(declinedLine({ declinedAt: new Date("2026-10-09T10:00:00Z").getTime() }, NOW)).toBe("Declined 9 Oct.");
    expect(declinedLine({}, NOW)).toBe("Declined.");
  });
});

describe("openReviewNote (MARKET-X2)", () => {
  const review = (status: ReviewRequest["status"]) =>
    ({ status, reviewer: { name: "Dana Whitfield" } }) as unknown as ReviewRequest;
  it("does not call a review that came back 'out for review'", () => {
    expect(openReviewNote(review("back"), "short")).toBe("Back from Dana Whitfield. Booking ends that review.");
    expect(openReviewNote(review("back"), "long")).not.toMatch(/out for review/i);
  });
  it("says out for review while the reviewer has it", () => {
    expect(openReviewNote(review("out"), "short")).toBe("Out for review with Dana Whitfield. Booking takes it back from them.");
  });
});

describe("priorityPriceOf", () => {
  it("offers priority only above the standard price", () => {
    expect(priorityPriceOf({ price: 150, priorityPrice: 250 })).toBe(250);
    expect(priorityPriceOf({ price: 150, priorityPrice: 150 })).toBeNull();
    expect(priorityPriceOf({ price: 150, priorityPrice: null })).toBeNull();
    expect(priorityPriceOf({ price: 150 })).toBeNull();
  });
});
