import { beforeEach, describe, expect, it } from "vitest";
import { buildIcs, extractEvents } from "./Calendar";
import { useDraftStore } from "@/lib/store";

beforeEach(() => useDraftStore.setState({ drafts: {}, matters: {}, employees: {} }));

function makeDraft(jurisdiction: "UK" | "US" = "UK") {
  const id = useDraftStore.getState().createDraft("acas_ec_notification", { jurisdiction, actDate: "2026-10-01" }, "employee");
  return useDraftStore.getState().drafts[id];
}

describe("calendar and ICS reminders", () => {
  it.each(["UK", "US"] as const)("does not invent a calendar deadline for a new %s claim", (jurisdiction) => {
    const events = extractEvents([makeDraft(jurisdiction)]);
    expect(events).toEqual([]);
    expect(buildIcs(events)).not.toContain("BEGIN:VEVENT");
  });

  it.each(["UK", "US"] as const)("exports one clearly unverified historical %s reminder without synthetic Acas dates", (jurisdiction) => {
    const draft = makeDraft(jurisdiction);
    draft.context.protectedDeadline = { iso: "2026-11-21", basis: "Obsolete statutory formula" };
    const events = extractEvents([draft]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ iso: "2026-11-21", kind: "unverified" });
    expect(events[0].label).toContain("unverified reminder");
    const ics = buildIcs(events);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(ics).toContain("DTSTART;VALUE=DATE:20261121");
    expect(ics).toContain("DTEND;VALUE=DATE:20261122");
    expect(ics).toContain("Unverified reminder only");
    expect(ics).toContain("does not establish a legal time limit");
    expect(ics).not.toMatch(/20261010|6 weeks|ACAS EC by|limitation expires|Obsolete statutory formula/);
    expect(draft.context.protectedDeadline.basis).toBe("Obsolete statutory formula");
  });

  it("retains real explicit response/sending dates and excludes malformed or impossible dates", () => {
    const draft = makeDraft();
    draft.context.protectedDeadline = { iso: "2026-02-30", basis: "old" };
    draft.answers = { ...draft.answers, sendBy: "2026-10-09", appealDeadline: "2026-10-10", remedyDeadline: "2026-02-30", advisorDeadline: "2026-10-01T00:00:00Z", acceptanceDeadline: "bad" };
    const events = extractEvents([draft]);
    expect(events.map(e => [e.iso, e.kind])).toEqual([["2026-10-09", "send_by"], ["2026-10-10", "appeal"]]);
    expect(buildIcs(events).match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(events[1].basis).toContain("Recorded appeal date");
  });
});
