import { describe, expect, it } from "vitest";
import type { Draft, Matter } from "@/lib/letters/types";
import { deadlinePillText, deadlinesIcs, matterDeadlines, matterRef, nextDeadline, shortDeadlineLabel, tribunalItem } from "./model";
import { addDaysToDateOnly, todayDateOnly } from "@/lib/date-only";

const matter = (over: Partial<Matter> = {}): Matter =>
  ({
    id: "matter_abc123",
    name: "Jordan Hale, attendance",
    mode: "employer",
    color: "amber",
    status: "active",
    createdAt: new Date(2026, 9, 1).getTime(),
    updatedAt: new Date(2026, 9, 1).getTime(),
    ...over,
  }) as Matter;

const warning = (over: Partial<Draft> = {}): Draft =>
  ({
    id: "d1",
    mode: "employer",
    letterType: "warning",
    matterId: "matter_abc123",
    employee: { legalName: "Jordan Hale" },
    employer: { legalName: "Harbour Foods Ltd" },
    context: { jurisdiction: "UK" },
    answers: {},
    sections: [],
    createdAt: 0,
    updatedAt: 0,
    ...over,
  }) as unknown as Draft;

describe("matterRef", () => {
  it("is stable and differs between matters", () => {
    const a = matterRef(matter());
    expect(a).toMatch(/^M-2026-[A-Z0-9]{4}$/);
    expect(matterRef(matter())).toBe(a);
    expect(matterRef(matter({ id: "matter_xyz789" }))).not.toBe(a);
  });
});

describe("tribunalItem", () => {
  it("counts six months less a day from the day the letter was given", () => {
    const sentAt = new Date(2026, 9, 12, 10, 0).getTime();
    const item = tribunalItem(matter(), [warning({ exports: [{ format: "marked-sent", exportedAt: sentAt }] } as Partial<Draft>)]);
    expect(item?.iso).toBe("2027-04-11");
    expect(item?.detail).toBe("6 months less a day");
    expect(item?.note).toContain("12 Oct 2026");
  });

  it("says what starts the clock when nothing has been given yet", () => {
    const item = tribunalItem(matter(), [warning()]);
    expect(item?.iso).toBeUndefined();
    expect(item?.detail).toBe("Starts when the outcome letter is given");
  });

  it("uses the letter's protected deadline when it has one", () => {
    const item = tribunalItem(matter(), [warning({ context: { jurisdiction: "UK", protectedDeadline: { iso: "2027-01-31", basis: "x" } } } as Partial<Draft>)]);
    expect(item?.iso).toBe("2027-01-31");
  });
});

describe("matterDeadlines", () => {
  it("includes the key deadline, events and dated open tasks, soonest first", () => {
    const m = matter({ deadlineISO: "2099-01-20", deadlineLabel: "Review meeting" });
    const items = matterDeadlines(
      m,
      [],
      [{ id: "e1", matterId: m.id, kind: "hearing", label: "Hearing", whenISO: "2099-01-10T10:00", createdAt: 0 }],
      [
        { id: "t1", matterId: m.id, label: "Send outcome", dueISO: "2099-01-05", status: "open", createdAt: 0, updatedAt: 0 },
        { id: "t2", matterId: m.id, label: "Done one", dueISO: "2099-01-01", status: "done", createdAt: 0, updatedAt: 0 },
      ]
    );
    const titles = items.map((i) => i.title);
    expect(titles).toEqual(["Send outcome", "Hearing", "Review meeting"]);
    expect(nextDeadline(items)?.title).toBe("Send outcome");
    const ics = deadlinesIcs(items.map((item) => ({ matter: m, item })));
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics.match(/BEGIN:VEVENT/g)?.length).toBe(3);
  });
});

describe("header deadline pill", () => {
  it("keeps a short title and names the kind for a long one", () => {
    expect(shortDeadlineLabel({ kind: "task", title: "Outcome letter" })).toBe("Outcome letter");
    expect(shortDeadlineLabel({ kind: "task", title: "Send the outcome of the hearing to Jordan" })).toBe("Task");
    expect(shortDeadlineLabel({ kind: "event", eventKind: "hearing", title: "Disciplinary hearing with Jordan and his rep" })).toBe("Hearing");
    expect(shortDeadlineLabel({ kind: "tribunal", title: "Tribunal time limit for an unfair dismissal claim" })).toBe("Tribunal limit");
  });

  it("never cuts the title mid-phrase", () => {
    const iso = addDaysToDateOnly(todayDateOnly(), 3);
    const text = deadlinePillText({ kind: "task", title: "Send the outcome of the hearing to Jordan" }, iso);
    expect(text).toBe("Task due in 3 days");
    expect(text).not.toContain("…");
  });

  it("says today and overdue plainly", () => {
    expect(deadlinePillText({ kind: "task", title: "Outcome letter" }, todayDateOnly())).toBe("Outcome letter due today");
    expect(deadlinePillText({ kind: "task", title: "Outcome letter" }, addDaysToDateOnly(todayDateOnly(), -2))).toBe("Outcome letter 2 days overdue");
  });
});
