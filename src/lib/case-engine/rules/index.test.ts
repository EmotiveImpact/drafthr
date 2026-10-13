import { describe, expect, it } from "vitest";
import type { RuleContext, RuleId, RuleInput } from "../types";
import { RULE_INPUTS } from "./contract";
import { RULES, runRule } from "./index";

const ids = Object.keys(RULE_INPUTS) as RuleId[];
const today = "2026-10-13";
const contexts: RuleContext[] = [
  { jurisdiction: { country: "uk", nation: "england-wales" }, today },
  { jurisdiction: { country: "uk", nation: "scotland" }, today },
  { jurisdiction: { country: "uk", nation: "northern-ireland" }, today },
  { jurisdiction: { country: "us", state: "CA" }, today },
];
const contextFor = (id: RuleId) => (id.startsWith("uk.") ? contexts[0] : contexts[3]);

/** One complete, valid input per rule. */
const SAMPLES: Record<RuleId, RuleInput> = {
  "uk.tribunalTimeLimit": { claimType: "unfair_dismissal", relevantDate: "2026-11-02" },
  "uk.earlyConciliation": { limitDate: "2027-05-01", dayA: "2027-03-01", dayB: "2027-04-10" },
  "uk.companionPostponement": { proposedDate: "2026-11-26" },
  "uk.qualifyingService": { startDate: "2025-05-01", terminationDate: "2026-12-28", automaticReason: false },
  "uk.writtenReasons": { requestDate: "2026-11-10", pregnantOrOnLeave: true },
  "uk.statutoryNotice": { startDate: "2010-03-01", noticeDate: "2026-11-19" },
  "uk.suspensionReview": { suspensionStart: "2026-10-19", lastReview: "2026-11-02" },
  "uk.collectiveConsultation": { proposedCount: 25, firstDismissalDate: "2026-12-18" },
  "uk.hr1Deadline": { proposedCount: 25, firstDismissalDate: "2026-12-18", firstNoticeDate: "2026-10-19" },
  "uk.protectiveAwardMax": { dismissalDate: "2026-12-18" },
  "uk.statutoryRedundancyPay": { startDate: "2010-03-01", terminationDate: "2026-12-18", dateOfBirth: "1980-06-15", weeklyPay: 900 },
  "uk.familyLeaveProtectedPeriod": { leaveType: "maternity", birthDate: "2026-06-09", leaveEndDate: "2027-06-08" },
  "uk.trialPeriodEnd": { newRoleStartDate: "2027-02-01", retrainingEndDate: "2027-04-30" },
  "uk.sexualHarassmentDuty": { conductDate: "2026-11-05" },
  "us.eeocCharge": { actDate: "2026-11-06", deferralState: true, basis: "national_origin" },
  "us.caCivilRights": { actDate: "2026-11-06" },
  "us.warnNotice": { firstSeparationDate: "2027-01-08" },
  "us.owbpa": { agreementGivenDate: "2026-11-02", groupProgramme: true, signedDate: "2026-11-20" },
};

describe("RULES", () => {
  it("has a rule for every entry in the contract", () => {
    expect(Object.keys(RULES).sort()).toEqual([...ids].sort());
  });

  it("asks for exactly the contract's required inputs when given nothing", () => {
    for (const id of ids) {
      expect(RULES[id]({}, contextFor(id)).missing?.slice().sort(), id).toEqual([...RULE_INPUTS[id].required].sort());
    }
  });

  it("reads only the contract's input names", () => {
    for (const id of ids) {
      const read = new Set<string>();
      const watched = new Proxy({ ...SAMPLES[id] }, {
        get(target, key) {
          if (typeof key === "string") read.add(key);
          return Reflect.get(target, key);
        },
      });
      RULES[id](watched, contextFor(id));
      const allowed = [...RULE_INPUTS[id].required, ...RULE_INPUTS[id].optional];
      expect([...read].filter((name) => !allowed.includes(name)), id).toEqual([]);
    }
  });

  it("fills basis and sources, in plain text without em dashes", () => {
    for (const ctx of contexts) {
      for (const id of ids) {
        const r = runRule(id, SAMPLES[id], ctx);
        const label = `${id} in ${JSON.stringify(ctx.jurisdiction)}`;
        expect(r.basis.length, label).toBeGreaterThan(0);
        expect(r.basis, label).not.toMatch(/[\u2013\u2014]/);
        for (const note of r.toVerify ?? []) expect(note, label).not.toMatch(/[\u2013\u2014]/);
        if (!r.notApplicable) {
          expect(r.missing, label).toBeUndefined();
          expect(r.sources.length, label).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe("runRule", () => {
  const ew = contexts[0];
  const us = contexts[3];

  it("returns missing inputs with a basis line, without running the rule", () => {
    const r = runRule("uk.tribunalTimeLimit", { claimType: "unfair_dismissal", relevantDate: null }, ew);
    expect(r).toEqual({
      date: null,
      basis: "Needs relevantDate before this can be worked out.",
      sources: [],
      missing: ["relevantDate"],
    });
    expect(runRule("uk.hr1Deadline", { firstNoticeDate: "2026-10-19" }, ew).missing).toEqual([
      "proposedCount",
      "firstDismissalDate",
    ]);
  });

  it("lets a rule run without its optional inputs", () => {
    expect(runRule("uk.hr1Deadline", { proposedCount: 25, firstDismissalDate: "2026-12-18" }, ew).date).toBe("2026-11-17");
  });

  it("puts the wrong country before missing inputs", () => {
    expect(runRule("uk.tribunalTimeLimit", {}, us).notApplicable).toBeTruthy();
    expect(runRule("us.eeocCharge", {}, ew).notApplicable).toBeTruthy();
  });
});
