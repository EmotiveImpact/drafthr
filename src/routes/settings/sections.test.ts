import { describe, expect, it } from "vitest";
import { SETTINGS_SECTIONS, resolveSettingsSection, tabParamFor } from "./sections";

describe("Settings deep links", () => {
  it("opens Profile with no tab or an unknown tab", () => {
    expect(resolveSettingsSection(null)).toBe("profile");
    expect(resolveSettingsSection("")).toBe("profile");
    expect(resolveSettingsSection("nonsense")).toBe("profile");
  });

  it("keeps every old tab link working", () => {
    expect(resolveSettingsSection("profile")).toBe("profile");
    expect(resolveSettingsSection("company")).toBe("workspace");
    expect(resolveSettingsSection("defaults")).toBe("defaults");
    expect(resolveSettingsSection("team")).toBe("team");
    expect(resolveSettingsSection("security")).toBe("security");
    expect(resolveSettingsSection("billing")).toBe("billing");
    expect(resolveSettingsSection("data")).toBe("data");
  });

  it("opens the new sections by id, case-insensitively", () => {
    expect(resolveSettingsSection("policies")).toBe("policies");
    expect(resolveSettingsSection("Integrations")).toBe("integrations");
    expect(resolveSettingsSection("workspace")).toBe("workspace");
  });

  it("round-trips every section through the URL", () => {
    for (const s of SETTINGS_SECTIONS) {
      expect(resolveSettingsSection(tabParamFor(s.id))).toBe(s.id);
    }
    expect(tabParamFor("profile")).toBeNull();
  });

  it("groups the list as You, Workspace, Account with Security reachable", () => {
    expect(SETTINGS_SECTIONS.map((s) => s.label)).toEqual([
      "Profile",
      "Workspace",
      "Team and roles",
      "Policies",
      "Letter defaults",
      "Integrations and Directory Sync",
      "Billing",
      "Security",
      "Privacy and data",
    ]);
    expect(SETTINGS_SECTIONS.find((s) => s.id === "security")?.group).toBe("Account");
  });
});
