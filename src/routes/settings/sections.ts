/**
 * The Settings sections, in the order of the section list, and how a
 * `?tab=` value maps onto them. Old links (the seven tabs Settings used to
 * have) keep working: `?tab=company` opens Workspace, `?tab=data` opens
 * Privacy and data, and so on. No `tab` opens Profile.
 */
export type SettingsSectionId =
  | "profile"
  | "workspace"
  | "team"
  | "policies"
  | "defaults"
  | "integrations"
  | "billing"
  | "security"
  | "data";

export type SettingsGroup = "You" | "Workspace" | "Account";

export type SettingsSection = {
  id: SettingsSectionId;
  label: string;
  group: SettingsGroup;
  /** The line under the pane title. */
  line: string;
};

export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    id: "profile",
    label: "Profile",
    group: "You",
    line: "Your role and the details DraftHR fills into new letters.",
  },
  {
    id: "workspace",
    label: "Workspace",
    group: "Workspace",
    line: "The company on your letters, with its letterhead and signature.",
  },
  {
    id: "team",
    label: "Team and roles",
    group: "Workspace",
    line: "People with access to this workspace. Admins can invite, change roles and remove members.",
  },
  {
    id: "policies",
    label: "Policies",
    group: "Workspace",
    line: "The workplace policies your letters may refer to, with a link to each.",
  },
  {
    id: "defaults",
    label: "Letter defaults",
    group: "Workspace",
    line: "The jurisdiction, tone and model every new letter starts with. You can change any of them in the wizard.",
  },
  {
    id: "integrations",
    label: "Integrations and Directory Sync",
    group: "Workspace",
    line: "Connect your identity provider so staff accounts stay in step.",
  },
  {
    id: "billing",
    label: "Billing",
    group: "Account",
    line: "Only owners and admins can change the plan or payment details.",
  },
  {
    id: "security",
    label: "Security",
    group: "Account",
    line: "Your password and, for admins, the audit log stream.",
  },
  {
    id: "data",
    label: "Privacy and data",
    group: "Account",
    line: "What DraftHR keeps in this browser, and how to export or clear it.",
  },
];

/** Legacy tab ids from the old underline tabs. */
const ALIASES: Record<string, SettingsSectionId> = {
  company: "workspace",
  members: "team",
  directory: "integrations",
  "directory-sync": "integrations",
  privacy: "data",
};

/** The section a `?tab=` value opens. Unknown or missing values open Profile. */
export function resolveSettingsSection(tab: string | null | undefined): SettingsSectionId {
  if (!tab) return "profile";
  const key = tab.trim().toLowerCase();
  if (ALIASES[key]) return ALIASES[key];
  const hit = SETTINGS_SECTIONS.find((s) => s.id === key);
  return hit ? hit.id : "profile";
}

/** The `?tab=` value written when a section is picked (none for Profile). */
export function tabParamFor(id: SettingsSectionId): string | null {
  return id === "profile" ? null : id;
}

export function sectionById(id: SettingsSectionId): SettingsSection {
  return SETTINGS_SECTIONS.find((s) => s.id === id) ?? SETTINGS_SECTIONS[0]!;
}
