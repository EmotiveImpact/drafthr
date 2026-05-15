import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Mode, Tone, EmployeeTone, UkRegion, UsState, WorkerClass } from "./letters/types";
import { DEFAULT_MODEL } from "./llm/default-model";
import { isSafeImageRef } from "./safe-data-url";

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
 * - qwen3-max:   flagship, multilingual, longest context, paid plan
 * - qwen-flash: fastest Qwen3 tier (default for daily drafting)
 * - qwen-max:    previous flagship
 * - qwen-plus:   balanced, free-tier capable
 * - qwen-turbo:  fastest / cheapest (Qwen 2.x line)
 */
export type ModelId =
  | "claude-opus-4-7"
  | "claude-sonnet-4-6"
  | "claude-haiku-4-5";

/** Legacy alias kept so existing Settings imports still compile. */
export type QwenModelId = ModelId;

export const MODEL_OPTIONS: {
  id: ModelId;
  label: string;
  hint: string;
  provider: "anthropic";
}[] = [
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", hint: "Default. Tier-leading legal register, ~$0.18/letter.", provider: "anthropic" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", hint: "Fast + cheap, ~$0.02/letter. Good for low-risk drafts.", provider: "anthropic" },
  { id: "claude-opus-4-7", label: "Claude Opus 4.7", hint: "Highest quality, ~$0.90/letter. Tribunal-bound + high-risk only.", provider: "anthropic" },
];

/** @deprecated Use MODEL_OPTIONS. Kept for callers that haven't migrated. */
export const QWEN_MODEL_OPTIONS = MODEL_OPTIONS;

/**
 * Workspace-level permission tier. Drives approval queue + editor gating.
 * - owner:    full access, billing, members
 * - admin:    full access except billing
 * - drafter:  create + edit own drafts; submit for review
 * - reviewer: drafter + can approve / request changes
 * - viewer:   read-only
 */
export type WorkspaceRole =
  | "owner"
  | "admin"
  | "drafter"
  | "reviewer"
  | "viewer";

/**
 * Single source of truth for "who the user is". Persisted to localStorage now;
 * moves to Postgres when WorkOS auth is wired (Phase B follow-up).
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
  /** Credits balance for AI-powered features (e.g. AI specialist review on
   * the Finalize page). New accounts start with FREE_CREDITS_ALLOWANCE. */
  credits: number;
  /** Workspace permission tier. Defaults to "owner" (single-user case). */
  workspaceRole: WorkspaceRole;
};

/** Starter credits each new user gets. ~6 AI reviews at 5 credits each. */
export const FREE_CREDITS_ALLOWANCE = 30;
/** Cost of one AI specialist review. */
export const AI_REVIEW_COST = 5;

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
  credits: FREE_CREDITS_ALLOWANCE,
  workspaceRole: "owner",
};

type Store = {
  profile: Profile;
  setRole: (role: Mode) => void;
  patch: (patch: Partial<Profile>) => void;
  patchPersonal: (patch: Partial<Profile["personal"]>) => void;
  patchEmployer: (patch: Partial<Profile["employer"]>) => void;
  patchDefaults: (patch: Partial<Profile["defaults"]>) => void;
  setAutoFill: (value: boolean) => void;
  setWorkspaceRole: (role: WorkspaceRole) => void;
  markSetupComplete: () => void;
  /** Subtract credits (e.g. on AI review). No-op + returns false if not enough. */
  spendCredits: (amount: number) => boolean;
  /** Add credits (top-up flow / promo / refund). */
  addCredits: (amount: number) => void;
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
        set((s) => ({
          profile: {
            ...s.profile,
            employer: { ...s.profile.employer, ...sanitizeEmployerPatch(patch) },
          },
        })),
      patchDefaults: (patch) =>
        set((s) => ({ profile: { ...s.profile, defaults: { ...s.profile.defaults, ...patch } } })),
      setAutoFill: (value) =>
        set((s) => ({ profile: { ...s.profile, autoFill: value } })),
      setWorkspaceRole: (role) =>
        set((s) => ({ profile: { ...s.profile, workspaceRole: role } })),
      markSetupComplete: () =>
        set((s) => ({ profile: { ...s.profile, setupComplete: true } })),
      spendCredits: (amount) => {
        // Read latest store snapshot to avoid stale reads across rapid clicks.
        const current = useProfileStore.getState().profile.credits ?? 0;
        if (current < amount) return false;
        set((s) => ({
          profile: { ...s.profile, credits: (s.profile.credits ?? 0) - amount },
        }));
        return true;
      },
      addCredits: (amount) =>
        set((s) => ({
          profile: { ...s.profile, credits: (s.profile.credits ?? 0) + amount },
        })),
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
        // Backfill credits for pre-existing profiles (added 2026-05-13).
        if (typeof state.profile.credits !== "number") {
          state.profile.credits = FREE_CREDITS_ALLOWANCE;
        }
        // Backfill workspaceRole — pre-existing profiles default to "owner"
        // so single-user installs stay fully-permissioned after upgrade.
        if (!state.profile.workspaceRole) {
          state.profile.workspaceRole = "owner";
        }
        // Backfill missing model.
        if (!state.profile.defaults.qwenModel) {
          state.profile.defaults.qwenModel = DEFAULT_MODEL;
          return;
        }
        // Reset any saved model that's no longer in MODEL_OPTIONS. This
        // catches every legacy provider (Qwen, Gemini, NVIDIA NIM,
        // OpenRouter) since we collapsed to Anthropic-only.
        const validIds = new Set(MODEL_OPTIONS.map((m) => m.id));
        if (!validIds.has(state.profile.defaults.qwenModel)) {
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
    // Accept either legacy data: URLs or post-migration https blob URLs.
    if (isSafeImageRef(profile.employer.letterheadDataUrl)) {
      out.letterheadDataUrl = profile.employer.letterheadDataUrl;
      out.hasLetterhead = true;
    }
    if (isSafeImageRef(profile.employer.signatureDataUrl)) {
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

function sanitizeEmployerPatch(
  patch: Partial<Profile["employer"]>
): Partial<Profile["employer"]> {
  return {
    ...patch,
    letterheadDataUrl:
      patch.letterheadDataUrl === undefined || isSafeImageRef(patch.letterheadDataUrl)
        ? patch.letterheadDataUrl
        : undefined,
    signatureDataUrl:
      patch.signatureDataUrl === undefined || isSafeImageRef(patch.signatureDataUrl)
        ? patch.signatureDataUrl
        : undefined,
  };
}
