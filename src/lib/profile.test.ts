import { describe, it, expect } from "vitest";
import { prefillsFromProfile, profileUpdatesFromAnswers, type Profile } from "./profile";

const baseProfile: Profile = {
  setupComplete: true,
  role: "employee",
  personal: {
    legalName: "Jane Patel",
    preferredName: "Jane",
    address: "12 Garden Road, London EC1 1AA",
    email: "jane@example.com",
    jobTitle: "Senior Engineer",
    department: "Platform",
    startDate: "2022-01-15",
  },
  employer: {
    legalName: "Acme Holdings Limited",
    address: "1 Acme Way, London EC2 2BB",
    recipientName: "Sam Khan",
    recipientTitle: "HR Director",
  },
  defaults: {
    jurisdiction: "UK",
    ukRegion: "England & Wales",
    workerClass: "employee",
    employeeTone: "assertive",
  },
  autoFill: true,
  credits: 30,
  workspaceRole: "owner",
};

describe("prefillsFromProfile (employee)", () => {
  it("populates jurisdiction + worker class + tone defaults", () => {
    const out = prefillsFromProfile(baseProfile, "employee");
    expect(out.jurisdiction).toBe("UK");
    expect(out.ukRegion).toBe("England & Wales");
    expect(out.workerClass).toBe("employee");
    expect(out.employeeTone).toBe("assertive");
  });

  it("populates employee identity from personal block", () => {
    const out = prefillsFromProfile(baseProfile, "employee");
    expect(out.employeeLegalName).toBe("Jane Patel");
    expect(out.employeePreferredName).toBe("Jane");
    expect(out.employeeJobTitle).toBe("Senior Engineer");
    expect(out.employeeAddress).toContain("Garden Road");
    expect(out.employeeStartDate).toBe("2022-01-15");
  });

  it("populates employer block + HR recipient", () => {
    const out = prefillsFromProfile(baseProfile, "employee");
    expect(out.employerLegalName).toBe("Acme Holdings Limited");
    expect(out.recipientName).toBe("Sam Khan");
    expect(out.recipientTitle).toBe("HR Director");
  });

  it("returns empty when autoFill is off", () => {
    const out = prefillsFromProfile({ ...baseProfile, autoFill: false }, "employee");
    expect(out).toEqual({});
  });
});

describe("prefillsFromProfile (employer)", () => {
  it("falls back to personal name as signatory when employer.signatoryName missing", () => {
    const profile: Profile = {
      ...baseProfile,
      role: "employer",
      employer: { ...baseProfile.employer, signatoryName: undefined, signatoryTitle: undefined },
      defaults: { ...baseProfile.defaults, tone: "formal" },
    };
    const out = prefillsFromProfile(profile, "employer");
    expect(out.signatoryName).toBe("Jane Patel");
    expect(out.signatoryTitle).toBe("Senior Engineer");
    expect(out.tone).toBe("formal");
  });

  it("does NOT populate employee* fields in employer mode", () => {
    const out = prefillsFromProfile({ ...baseProfile, role: "employer" }, "employer");
    expect(out.employeeLegalName).toBeUndefined();
    expect(out.employeeJobTitle).toBeUndefined();
  });
});

describe("profileUpdatesFromAnswers", () => {
  it("extracts jurisdiction + region from answers", () => {
    const updates = profileUpdatesFromAnswers(
      { jurisdiction: "US", usState: "CA", workerClass: "employee" },
      "employee"
    );
    expect(updates.defaults.jurisdiction).toBe("US");
    expect(updates.defaults.usState).toBe("CA");
    expect(updates.defaults.workerClass).toBe("employee");
  });

  it("extracts personal identity in employee mode but not employer mode", () => {
    const a = {
      employeeLegalName: "Jane",
      employeeJobTitle: "Engineer",
      signatoryName: "Should not propagate",
    };
    const eeUpdates = profileUpdatesFromAnswers(a, "employee");
    expect(eeUpdates.personal.legalName).toBe("Jane");
    expect(eeUpdates.personal.jobTitle).toBe("Engineer");
    expect(eeUpdates.employer.signatoryName).toBeUndefined();

    const erUpdates = profileUpdatesFromAnswers(a, "employer");
    expect(erUpdates.personal.legalName).toBeUndefined();
    expect(erUpdates.employer.signatoryName).toBe("Should not propagate");
  });

  it("ignores unknown fields", () => {
    const updates = profileUpdatesFromAnswers(
      { random: "junk", foo: 42 },
      "employee"
    );
    expect(updates.personal).toEqual({});
    expect(updates.employer).toEqual({});
    expect(updates.defaults).toEqual({});
  });
});
