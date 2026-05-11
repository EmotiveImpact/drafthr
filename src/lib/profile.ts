import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Mode, Tone, EmployeeTone, UkRegion, UsState, WorkerClass } from "./letters/types";
import { DEFAULT_MODEL } from "./llm/default-model";

/**
 * Generation model identifiers. We support two providers — Anthropic and
 * DashScope International (Qwen). The provider is inferred from the model
 * name prefix in buildModel() on the server.
 *
 * Anthropic Claude:
 * - claude-opus-4-7:   highest-quality legal writing, slowest, most expensive
 * - claude-sonnet-4-6: tier-leading register/structure, balanced cost
 * - claude-haiku-4-5:  fast + cheap, weakest for long-form legal prose
 *
 * Qwen (DashScope):
 * - qwen3-max:  flagship, multilingual, longest context, paid plan
 * - qwen-max:   previous flagship
 * - qwen-plus:  balanced, free-tier capable
 * - qwen-turbo: fastest / cheapest
 */
export type ModelId =
  | "claude-opus-4-7"
  | "claude-sonnet-4-6"
  | "claude-haiku-4-5"
  | "qwen3-max"
  | "qwen-max"
  | "qwen-plus"
  | "qwen-turbo";

/** Legacy alias kept so existing Settings imports still compile. */
export type QwenModelId = ModelId;

export const MODEL_OPTIONS: {
  id: ModelId;
  label: string;
  hint: string;
  provider: "anthropic" | "qwen";
}[] = [
  // Anthropic first — tier-leading legal writing register.
  { id: "claude-opus-4-7", label: "Claude Opus 4.7", hint: "Best for tribunal-bound + high-risk letters. Slowest, most expensive.", provider: "anthropic" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", hint: "Recommended default. Tier-leading register, balanced cost.", provider: "anthropic" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", hint: "Fast + cheap. Use for low-risk drafts.", provider: "anthropic" },
  // Qwen fallback / alternative — multilingual.
  { id: "qwen3-max", label: "Qwen3 Max", hint: "Alibaba flagship. Strong multilingual support, paid plan.", provider: "qwen" },
  { id: "qwen-max", label: "Qwen Max", hint: "Previous Qwen flagship.", provider: "qwen" },
  { id: "qwen-plus", label: "Qwen Plus", hint: "Free-tier capable.", provider: "qwen" },
  { id: "qwen-turbo", label: "Qwen Turbo", hint: "Fastest, cheapest Qwen model.", provider: "qwen" },
];

/** @deprecated Use MODEL_OPTIONS. Kept for callers that haven't migrated. */
export const QWEN_MODEL_OPTIONS = MODEL_OPTIONS;

/**
 * Single source of truth for "who the user is". Persisted to localStorage now;
 * moves to Postgres when Clerk auth is wired (Phase B follow-up).
 */
export type Profile = {
  /** Whether the user has completed first-run setup. */
  setupComplete: boolean;
  /** The user's role. Drives sidebar contents and routing. */
  role: Mode | null;
  /** Identity details — used as both employee fields (employee mode) and HR-employee-template fields (employer mode). */
  personal: {
    legalName?: string;
    preferredName?: string;
    address?: string;
    email?: string;
    phone?: string;
    jobTitle?: string;
    department?: string;
    /** Continuous service start (employee mode) or HR signatory's role since (employer mode). */
    startDate?: string;
  };
  /** The relevant employing entity. Employer mode = the user's company; Employee mode = the user's current employer. */
  employer: {
    legalName?: string;
    address?: string;
    registrationNumber?: string;
    /** Employer-mode only: the person signing letters out. */
    signatoryName?: string;
    signatoryTitle?: string;
    /** Employee-mode: who at HR the user typically writes to. */
    recipientName?: string;
    recipientTitle?: string;
    /** Letterhead image (base64 data URL) — defaulted into every employer-mode draft. */
    letterheadDataUrl?: string;
    /** Signature image (base64 data URL) — defaulted into every employer-mode draft. */
    signatureDataUrl?: string;
  };
  /** Defaults pre-filled into every wizard. */
  defaults: {
    jurisdiction: "UK" | "US";
    ukRegion?: UkRegion;
    usState?: UsState;
    workerClass: WorkerClass;
    tone?: Tone;
    employeeTone?: EmployeeTone;
    /** DashScope model id. Defaults to qwen3-max (flagship). */
    qwenModel?: QwenModelId;
  };
  /** Whether to auto-fill wizards from this profile. User can toggle. */
  autoFill: boolean;
};

const EMPTY_PROFILE: Profile = {
  setupComplete: false,
  role: null,
  personal: {},
  employer: {},
  defaults: {
    jurisdiction: "UK",
    workerClass: "employee",
    // Set up-front so the Settings dropdown shows a saved value (matches
    // AIPanel header + server fallback) instead of relying on a `??`
    // fallback that doesn't actually fire onValueChange when re-selected.
    qwenModel: DEFAULT_MODEL,
  },
  autoFill: true,
};

type Store = {
  profile: Profile;
  setRole: (role: Mode) => void;
  patch: (patch: Partial<Profile>) => void;
  patchPersonal: (patch: Partial<Profile["personal"]>) => void;
  patchEmployer: (patch: Partial<Profile["employer"]>) => void;
  patchDefaults: (patch: Partial<Profile["defaults"]>) => void;
  setAutoFill: (value: boolean) => void;
  markSetupComplete: () => void;
  reset: () => void;
};

export const useProfileStore = create<Store>()(
  persist(
    (set) => ({
      profile: EMPTY_PROFILE,
      setRole: (role) =>
        set((s) => ({ profile: { ...s.profile, role } })),
      patch: (patch) =>
        set((s) => ({ profile: { ...s.profile, ...patch } })),
      patchPersonal: (patch) =>
        set((s) => ({ profile: { ...s.profile, personal: { ...s.profile.personal, ...patch } } })),
      patchEmployer: (patch) =>
        set((s) => ({ profile: { ...s.profile, employer: { ...s.profile.employer, ...patch } } })),
      patchDefaults: (patch) =>
        set((s) => ({ profile: { ...s.profile, defaults: { ...s.profile.defaults, ...patch } } })),
      setAutoFill: (value) =>
        set((s) => ({ profile: { ...s.profile, autoFill: value } })),
      markSetupComplete: () =>
        set((s) => ({ profile: { ...s.profile, setupComplete: true } })),
      reset: () => set({ profile: EMPTY_PROFILE }),
    }),
    {
      name: "scribehr-profile-v1",
      // Backfill the default model on existing localStorage profiles.
      // Before this fix, a fresh profile had qwenModel undefined, which
      // made Settings' dropdown display the `??` fallback but never
      // persist the choice — leading to a mismatch with the AIPanel
      // header which used a different `??` string. With qwenModel now
      // populated on hydrate, every surface reads the same value.
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        // Backfill missing model.
        if (!state.profile.defaults.qwenModel) {
          state.profile.defaults.qwenModel = DEFAULT_MODEL;
          return;
        }
        // One-time migration off the old Claude default for environments
        // that only have Qwen keys set. Users who explicitly picked a
        // Claude model in Settings keep it; only the auto-applied default
        // gets retargeted to the current DEFAULT_MODEL.
        if (state.profile.defaults.qwenModel === "claude-sonnet-4-6") {
          state.profile.defaults.qwenModel = DEFAULT_MODEL;
        }
      },
    }
  )
);

/**
 * Translate a Profile into wizard-answer prefills, scoped to the active mode.
 *
 * Conventions (matches what the wizard reads in store.ts):
 *  - Employer mode: the user IS the HR sender. Their personal details fill
 *    signatory*; their employer block fills employer*.
 *  - Employee mode: the user IS the employee. Their personal details fill
 *    employee*; the recipient on their employer block fills the recipient*.
 */
export function prefillsFromProfile(
  profile: Profile,
  mode: Mode
): Record<string, unknown> {
  if (!profile.autoFill) return {};

  const out: Record<string, unknown> = {};

  // Defaults
  out.jurisdiction = profile.defaults.jurisdiction;
  if (profile.defaults.ukRegion) out.ukRegion = profile.defaults.ukRegion;
  if (profile.defaults.usState) out.usState = profile.defaults.usState;
  out.workerClass = profile.defaults.workerClass;
  if (mode === "employer" && profile.defaults.tone) out.tone = profile.defaults.tone;
  if (mode === "employee" && profile.defaults.employeeTone)
    out.employeeTone = profile.defaults.employeeTone;

  // Employer block (the company)
  if (profile.employer.legalName) out.employerLegalName = profile.employer.legalName;
  if (profile.employer.address) out.employerAddress = profile.employer.address;
  if (profile.employer.registrationNumber)
    out.employerRegNumber = profile.employer.registrationNumber;

  if (mode === "employer") {
    // The user is HR — populate the signatory from their personal info.
    if (profile.employer.signatoryName) out.signatoryName = profile.employer.signatoryName;
    else if (profile.personal.legalName) out.signatoryName = profile.personal.legalName;
    if (profile.employer.signatoryTitle) out.signatoryTitle = profile.employer.signatoryTitle;
    else if (profile.personal.jobTitle) out.signatoryTitle = profile.personal.jobTitle;
    // Letterhead + signature default to the employer profile.
    if (profile.employer.letterheadDataUrl) {
      out.letterheadDataUrl = profile.employer.letterheadDataUrl;
      out.hasLetterhead = true;
    }
    if (profile.employer.signatureDataUrl) {
      out.signatureDataUrl = profile.employer.signatureDataUrl;
    }
  } else {
    // Employee mode — the user IS the employee.
    if (profile.personal.legalName) out.employeeLegalName = profile.personal.legalName;
    if (profile.personal.preferredName) out.employeePreferredName = profile.personal.preferredName;
    if (profile.personal.jobTitle) out.employeeJobTitle = profile.personal.jobTitle;
    if (profile.personal.department) out.employeeDepartment = profile.personal.department;
    if (profile.personal.address) out.employeeAddress = profile.personal.address;
    if (profile.personal.email) out.employeeEmail = profile.personal.email;
    if (profile.personal.startDate) out.employeeStartDate = profile.personal.startDate;
    if (profile.employer.recipientName) out.recipientName = profile.employer.recipientName;
    if (profile.employer.recipientTitle) out.recipientTitle = profile.employer.recipientTitle;
  }

  return out;
}

/**
 * Inverse helper — given a completed wizard's answers, extract the fields that
 * make sense to save back into the profile so the user gets prefill next time.
 */
export function profileUpdatesFromAnswers(
  answers: Record<string, unknown>,
  mode: Mode
): { personal: Partial<Profile["personal"]>; employer: Partial<Profile["employer"]>; defaults: Partial<Profile["defaults"]> } {
  const a = answers;
  const personal: Partial<Profile["personal"]> = {};
  const employer: Partial<Profile["employer"]> = {};
  const defaults: Partial<Profile["defaults"]> = {};

  if (a.jurisdiction === "UK" || a.jurisdiction === "US") defaults.jurisdiction = a.jurisdiction;
  if (typeof a.ukRegion === "string") defaults.ukRegion = a.ukRegion as UkRegion;
  if (typeof a.usState === "string") defaults.usState = a.usState as UsState;
  if (typeof a.workerClass === "string")
    defaults.workerClass = a.workerClass as WorkerClass;

  if (typeof a.employerLegalName === "string") employer.legalName = a.employerLegalName;
  if (typeof a.employerAddress === "string") employer.address = a.employerAddress;
  if (typeof a.employerRegNumber === "string") employer.registrationNumber = a.employerRegNumber;

  if (mode === "employer") {
    if (typeof a.signatoryName === "string") employer.signatoryName = a.signatoryName;
    if (typeof a.signatoryTitle === "string") employer.signatoryTitle = a.signatoryTitle;
  } else {
    if (typeof a.employeeLegalName === "string") personal.legalName = a.employeeLegalName;
    if (typeof a.employeePreferredName === "string")
      personal.preferredName = a.employeePreferredName;
    if (typeof a.employeeJobTitle === "string") personal.jobTitle = a.employeeJobTitle;
    if (typeof a.employeeDepartment === "string") personal.department = a.employeeDepartment;
    if (typeof a.employeeAddress === "string") personal.address = a.employeeAddress;
    if (typeof a.employeeEmail === "string") personal.email = a.employeeEmail;
    if (typeof a.employeeStartDate === "string") personal.startDate = a.employeeStartDate;
    if (typeof a.recipientName === "string") employer.recipientName = a.recipientName;
    if (typeof a.recipientTitle === "string") employer.recipientTitle = a.recipientTitle;
  }

  return { personal, employer, defaults };
}
