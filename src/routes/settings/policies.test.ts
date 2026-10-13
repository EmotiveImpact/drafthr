import { beforeEach, describe, expect, it } from "vitest";
import {
  POLICIES_KEY,
  addPolicy,
  clearPolicies,
  listPolicies,
  normalisePolicyUrl,
  removePolicy,
  resetPoliciesCache,
} from "./policies";

describe("workspace policies list", () => {
  beforeEach(() => {
    localStorage.clear();
    resetPoliciesCache();
  });

  it("starts empty, with no example policies", () => {
    expect(listPolicies()).toEqual([]);
  });

  it("adds, persists and removes a policy", () => {
    const p = addPolicy("  Disciplinary policy ", "intranet.example.co.uk/disciplinary", 1000);
    expect(p?.name).toBe("Disciplinary policy");
    expect(p?.url).toBe("https://intranet.example.co.uk/disciplinary");
    resetPoliciesCache();
    expect(listPolicies().map((x) => x.name)).toEqual(["Disciplinary policy"]);
    expect(JSON.parse(localStorage.getItem(POLICIES_KEY) ?? "[]")).toHaveLength(1);
    removePolicy(p!.id);
    expect(listPolicies()).toEqual([]);
  });

  it("refuses an empty name and drops a link that isn't a web address", () => {
    expect(addPolicy("   ")).toBeNull();
    expect(normalisePolicyUrl("javascript:alert(1)")).toBeUndefined();
    expect(normalisePolicyUrl("not a link")).toBeUndefined();
    expect(normalisePolicyUrl("")).toBeUndefined();
    expect(normalisePolicyUrl("https://example.com/p")).toBe("https://example.com/p");
  });

  it("clears with the rest of this device's data", () => {
    addPolicy("Grievance policy");
    clearPolicies();
    expect(listPolicies()).toEqual([]);
    expect(localStorage.getItem(POLICIES_KEY)).toBeNull();
  });
});
