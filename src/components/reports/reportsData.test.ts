import { describe, it, expect } from "vitest";
import type { Draft, Employee, Matter } from "@/lib/letters/types";
import {
  NO_MANAGER,
  byLetterType,
  byManager,
  chartBars,
  daysWords,
  departmentsOf,
  letterFacts,
  matterInDepartment,
  niceTop,
  oneDp,
  periodFrame,
  reportCsv,
  reportTiles,
  sentAtOf,
  timeToResolve,
  topTypesWithOther,
  updatedWords,
} from "./reportsData";

const DAY = 86_400_000;
const NOW = new Date(2026, 9, 13, 12, 0, 0).getTime(); // Tue 13 Oct 2026, midday

function draft(id: string, over: Partial<Draft> = {}): Draft {
  return {
    id,
    mode: "employer",
    letterType: "termination",
    employee: { legalName: "Jane Doe", jobTitle: "", address: "", startDate: "", serviceMonths: 0 },
    employer: { legalName: "Acme Ltd", address: "" },
    sections: [],
    answers: {},
    createdAt: NOW - 10 * DAY,
    updatedAt: NOW - 10 * DAY,
    ...over,
  } as unknown as Draft;
}

const sent = (at: number) => [{ id: `x${at}`, format: "marked-sent" as const, exportedAt: at }];

function employee(id: string, legalName: string, department?: string, managerName?: string): Employee {
  return { id, legalName, department, managerName, status: "active", createdAt: 0, updatedAt: 0 } as Employee;
}

describe("periodFrame", () => {
  it("12 months by month, oldest first, with the current month last", () => {
    const f = periodFrame("12m", NOW);
    expect(f.buckets).toHaveLength(12);
    expect(f.unit).toBe("month");
    expect(f.buckets[0].short).toBe("Nov");
    expect(f.buckets[11].long).toBe("October 2026");
    expect(f.buckets[11].current).toBe(true);
    expect(f.buckets.filter((b) => b.current)).toHaveLength(1);
  });

  it("30 days by day, 3 months by week", () => {
    expect(periodFrame("30d", NOW).buckets).toHaveLength(30);
    expect(periodFrame("30d", NOW).unit).toBe("day");
    const w = periodFrame("3m", NOW);
    expect(w.unit).toBe("week");
    expect(w.buckets).toHaveLength(13);
    expect(w.buckets[12].start).toBeLessThanOrEqual(NOW);
    expect(w.buckets[12].end).toBeGreaterThan(NOW);
  });

  it("all time starts from the first letter's month", () => {
    const f = periodFrame("all", NOW, new Date(2024, 0, 5).getTime());
    expect(f.buckets[0].long).toBe("January 2024");
    expect(f.start).toBe(Number.NEGATIVE_INFINITY);
  });
});

describe("letter facts", () => {
  it("reads the latest marked-sent export and the days to send", () => {
    const d = draft("a", {
      createdAt: NOW - 5 * DAY,
      exports: [
        { id: "1", format: "pdf", exportedAt: NOW - 4 * DAY },
        { id: "2", format: "marked-sent", exportedAt: NOW - 3 * DAY },
      ],
    } as Partial<Draft>);
    expect(sentAtOf(d)).toBe(NOW - 3 * DAY);
    const f = letterFacts(d, {});
    expect(f.daysToSend).toBeCloseTo(2);
    expect(f.at).toBe(NOW - 3 * DAY);
  });

  it("takes the department and manager from the employee record, else the letter", () => {
    const emps = { e1: employee("e1", "Jane Doe", "Sales", "Nadia Kaur") };
    const f = letterFacts(draft("a"), emps);
    expect(f.department).toBe("Sales");
    expect(f.manager).toBe("Nadia Kaur");
    const g = letterFacts(
      draft("b", { employee: { legalName: "Nobody", department: "Finance" } as Draft["employee"] }),
      emps
    );
    expect(g.department).toBe("Finance");
    expect(g.manager).toBeUndefined();
  });

  it("never throws on a letter the checks can't read", () => {
    const broken = draft("x", { sections: undefined as unknown as Draft["sections"] });
    expect(() => letterFacts(broken, {})).not.toThrow();
  });

  it("lists departments from employee records", () => {
    expect(departmentsOf({ a: employee("a", "A", "Sales"), b: employee("b", "B", "Ops"), c: employee("c", "C") })).toEqual([
      "Ops",
      "Sales",
    ]);
  });
});

describe("tiles", () => {
  const frame = periodFrame("12m", NOW);
  const monthStart = new Date(2026, 9, 1).getTime();
  const letters = [
    // Two sent this month, one sent last month before this point, one after it.
    draft("a", { createdAt: monthStart + DAY, exports: sent(monthStart + 2 * DAY) } as Partial<Draft>),
    draft("b", { createdAt: monthStart + DAY, exports: sent(monthStart + 3 * DAY) } as Partial<Draft>),
    draft("c", { createdAt: new Date(2026, 8, 2).getTime(), exports: sent(new Date(2026, 8, 5).getTime()) } as Partial<Draft>),
    draft("d", { createdAt: new Date(2026, 8, 20).getTime(), exports: sent(new Date(2026, 8, 25).getTime()) } as Partial<Draft>),
  ].map((d) => letterFacts(d, {}));

  it("counts letters sent this month against the same point last month", () => {
    const t = reportTiles({ letters, matters: [], drafts: [], frame, now: NOW });
    expect(t.sentThisMonth).toBe(2);
    expect(t.sentDelta).toBe(1);
    expect(t.lastMonthName).toBe("Sep");
    expect(t.sentSeries).toHaveLength(12);
    expect(t.sentSeries[11]).toBe(2);
    expect(t.sentSeries[10]).toBe(2);
  });

  it("averages the days from creation to sent, month on month", () => {
    const t = reportTiles({ letters, matters: [], drafts: [], frame, now: NOW });
    // This month: 1 and 2 days. Last month: 3 and 5 days.
    expect(t.timeToSend.days).toBeCloseTo((1 + 2 + 3 + 5) / 4);
    expect(t.timeToSend.delta).toBe(-2.5);
  });

  it("counts open high-risk matters and the ones new this week", () => {
    const matters = [
      { id: "m1", name: "One", mode: "employer", status: "active", riskBand: "high", createdAt: NOW - 2 * DAY, updatedAt: NOW },
      { id: "m2", name: "Two", mode: "employer", status: "active", riskBand: "critical", createdAt: NOW - 40 * DAY, updatedAt: NOW },
      { id: "m3", name: "Three", mode: "employer", status: "closed", riskBand: "high", createdAt: NOW - 40 * DAY, updatedAt: NOW },
    ] as unknown as Matter[];
    const t = reportTiles({ letters, matters, drafts: [], frame, now: NOW });
    expect(t.highRisk.open).toBe(2);
    expect(t.highRisk.newThisWeek).toBe(1);
    expect(t.highRisk.series[11]).toBe(2);
  });
});

describe("chart and breakdowns", () => {
  const emps = {
    e1: employee("e1", "Sam", "Ops", "Hannah Reid"),
    e2: employee("e2", "Leah", "Ops", "Hannah Reid"),
    e3: employee("e3", "Ravi", "Sales"),
  };
  const mk = (id: string, name: string, type: string, sentAt?: number) =>
    letterFacts(
      draft(id, {
        letterType: type as Draft["letterType"],
        employee: { legalName: name } as Draft["employee"],
        createdAt: (sentAt ?? NOW) - 2 * DAY,
        exports: sentAt ? sent(sentAt) : [],
        matterId: id === "a" ? "m1" : undefined,
      } as Partial<Draft>),
      emps
    );
  const letters = [
    mk("a", "Sam", "termination", NOW - DAY),
    mk("b", "Leah", "termination", NOW - 40 * DAY),
    mk("c", "Ravi", "offer_letter"),
  ];

  it("puts sent letters in their month", () => {
    const bars = chartBars(letters, periodFrame("12m", NOW));
    expect(bars[11].sent).toBe(1);
    expect(bars[10].sent + bars[9].sent).toBe(1);
    expect(bars.reduce((n, b) => n + b.sent, 0)).toBe(2);
  });

  it("groups by letter type, most first, with Other for the rest", () => {
    const rows = byLetterType(letters);
    expect(rows[0]).toMatchObject({ id: "termination", count: 2 });
    const many = Array.from({ length: 9 }, (_, i) => ({ id: `t${i}`, label: `T${i}`, count: 9 - i }));
    const top = topTypesWithOther(many, 6);
    expect(top).toHaveLength(7);
    expect(top[6]).toEqual({ id: "other", label: "Other", count: 3 + 2 + 1 });
  });

  it("groups by manager, with letters for people without one last", () => {
    const matters = [{ id: "m1", status: "active" }] as Matter[];
    const rows = byManager(letters, matters);
    expect(rows.map((r) => r.name)).toEqual(["Hannah Reid", NO_MANAGER]);
    expect(rows[0]).toMatchObject({ letters: 2, department: "Ops", openMatters: 1 });
    expect(rows[1].avgDaysToSend).toBeNull();
  });

  it("finds a matter's department from its letters or its main party", () => {
    const m = { id: "m1", parties: { primaryName: "Ravi" } } as Matter;
    expect(matterInDepartment(m, "Ops", letters, emps)).toBe(true);
    expect(matterInDepartment(m, "Sales", letters, emps)).toBe(true);
    expect(matterInDepartment(m, "Finance", letters, emps)).toBe(false);
  });
});

describe("small helpers", () => {
  it("rounds and words days", () => {
    expect(oneDp(2.44)).toBe("2.4");
    expect(oneDp(3)).toBe("3");
    expect(daysWords(1)).toBe("1 day");
    expect(daysWords(2.06)).toBe("2.1 days");
  });

  it("picks an even, whole-number scale", () => {
    expect(niceTop(0)).toBe(4);
    expect(niceTop(33)).toBe(40);
    expect(niceTop(10)).toBe(12);
    expect(niceTop(85)).toBe(120);
    for (const n of [5, 9, 17, 250]) {
      const top = niceTop(n);
      expect(top).toBeGreaterThanOrEqual(n);
      expect(Number.isInteger(top / 4)).toBe(true);
    }
  });

  it("says when the figures were worked out", () => {
    expect(updatedWords(NOW - 20_000, NOW)).toBe("just now");
    expect(updatedWords(NOW - 60_000, NOW)).toBe("1 minute ago");
    expect(updatedWords(NOW - 5 * 60_000, NOW)).toBe("5 minutes ago");
    expect(updatedWords(NOW - 2 * 3_600_000, NOW)).toBe("2 hours ago");
  });

  it("works out time to resolve from closed and archived matters", () => {
    const r = timeToResolve([
      { status: "closed", createdAt: NOW - 10 * DAY, updatedAt: NOW },
      { status: "archived", createdAt: NOW - 20 * DAY, archivedAt: NOW, updatedAt: NOW },
      { status: "active", createdAt: NOW - 99 * DAY, updatedAt: NOW },
    ] as Matter[]);
    expect(r.count).toBe(2);
    expect(r.medianDays).toBe(15);
  });
});

describe("CSV export", () => {
  it("writes every section and quotes cells with commas", () => {
    const frame = periodFrame("12m", NOW);
    const letters = [letterFacts(draft("a", { exports: sent(NOW - DAY) } as Partial<Draft>), {})];
    const csv = reportCsv({
      workspace: "Harbour Foods",
      period: frame.label,
      department: "All departments",
      now: NOW,
      tiles: reportTiles({ letters, matters: [], drafts: [], frame, now: NOW }),
      bars: chartBars(letters, frame),
      types: byLetterType(letters),
      managers: byManager(letters, []),
      failing: [{ id: "x", label: "Missing disclaimer", description: "", count: 1, where: "Warning, Offer and 2 more" }],
    });
    expect(csv).toContain("Period,Last 12 months");
    expect(csv).toContain("Letters sent this month,1");
    expect(csv).toContain("October 2026,1,");
    expect(csv).toContain("Manager,Department,Letters");
    expect(csv).toContain(`${NO_MANAGER},`);
    expect(csv).toContain('Missing disclaimer,1,"Warning, Offer and 2 more"');
  });
});
