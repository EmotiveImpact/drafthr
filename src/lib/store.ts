import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { toast } from "sonner";
import {
  createQuotaSafeStorage,
  estimateLocalStorageBytes,
  hasUnpersistedWrites,
} from "./storage/quota-safe-storage";
import { TENANT_SCOPED_PERSIST_KEYS, WORKSPACE_SWAP_KEY } from "./session/clearLocalData";
import type {
  AIAction,
  AIChatMessage,
  ApprovalEntry,
  Collaborator,
  CollaboratorRole,
  Comment,
  CustomTemplate,
  Draft,
  DraftTimelineEvent,
  Employee,
  EvidenceItem,
  ExportEvent,
  LetterAnswers,
  LetterTypeId,
  Matter,
  MatterColor,
  MatterEvent,
  MatterParticipant,
  Mode,
  Section,
  SectionVersion,
  Task,
} from "./letters/types";
import { uid } from "./utils";
import { getLetterMeta } from "./letters/catalog";
import {
  addDaysToDateOnly,
  addMonthsToDateOnly,
  parseDateOnly,
  todayDateOnly,
} from "./date-only";
import { sanitizeLetterHtml } from "./sanitize";
import { isSafeImageRef } from "./safe-data-url";
import {
  acceptPendingSuggestionsHtml,
  hasPendingSuggestions,
  mergeAcceptedSuggestionsHtml,
} from "./tiptap/suggestion-merge";
import { diffHtmlAsSuggestion } from "./tiptap/html-diff";
import { getDiffViewMode } from "./diff-view-mode";

type Store = {
  drafts: Record<string, Draft>;
  /**
   * Named Matters (case / project / hiring round) that bundle related
   * drafts. See Draft.matterId for the join. Matters are global to the
   * draft store — they're not per-draft state.
   */
  matters: Record<string, Matter>;
  /**
   * Workspace-level normalized people directory. Lifted out of Draft.employee
   * so one person can appear across many drafts/matters without duplication.
   * HR mode owns this; employee-mode users have at most one record (themselves).
   */
  employees: Record<string, Employee>;
  /** Actionable next steps attached to a Matter. */
  tasks: Record<string, Task>;
  /** Meetings, hearings, deadlines on a Matter calendar. */
  events: Record<string, MatterEvent>;
  /** Workspace-saved reusable templates — user-defined "house phrasings". */
  customTemplates: Record<string, CustomTemplate>;
  createCustomTemplate: (
    input: Omit<CustomTemplate, "id" | "createdAt" | "updatedAt">
  ) => string;
  updateCustomTemplate: (id: string, patch: Partial<CustomTemplate>) => void;
  deleteCustomTemplate: (id: string) => void;
  /** Spawn a new draft from a saved custom template. Returns the new
   * draft id, or null when the template id doesn't exist. */
  createDraftFromCustomTemplate: (templateId: string, mode?: Mode) => string | null;
  createEmployee: (input: Omit<Employee, "id" | "createdAt" | "updatedAt">) => string;
  updateEmployee: (id: string, patch: Partial<Employee>) => void;
  /** Soft-archive — flips status to "left" and stamps endDate if absent. */
  archiveEmployee: (id: string) => void;
  /** Hard-delete the employee record and strip them from matter participants. */
  deleteEmployee: (id: string) => void;
  createTask: (input: Omit<Task, "id" | "createdAt" | "updatedAt">) => string;
  updateTask: (id: string, patch: Partial<Task>) => void;
  completeTask: (id: string) => void;
  deleteTask: (id: string) => void;
  createEvent: (input: Omit<MatterEvent, "id" | "createdAt">) => string;
  updateEvent: (id: string, patch: Partial<MatterEvent>) => void;
  deleteEvent: (id: string) => void;
  createMatter: (input: {
    name: string;
    mode: Mode;
    color: MatterColor;
    description?: string;
    primaryName?: string;
    primaryContext?: string;
    deadlineISO?: string;
    deadlineLabel?: string;
    counselReviewed?: boolean;
  }) => string;
  updateMatter: (id: string, patch: Partial<Matter>) => void;
  closeMatter: (id: string) => void;
  archiveMatter: (id: string) => void;
  deleteMatter: (id: string) => void;
  /** Add a participant (employee or external party) to a matter. No-op if the
   *  same employeeId is already a participant. */
  addMatterParticipant: (matterId: string, participant: MatterParticipant) => void;
  /** Remove the participant at the given index from a matter. */
  removeMatterParticipant: (matterId: string, index: number) => void;
  /** Set or clear a draft's matter membership. Pass null to remove. */
  assignDraftToMatter: (draftId: string, matterId: string | null) => void;
  /** Promote an auto-group (set of drafts sharing a person/employer) into
   * a named matter in one step. Creates the matter + bulk-assigns the
   * drafts + returns the new matter id. */
  upgradeGroupToMatter: (input: {
    name: string;
    mode: Mode;
    color: MatterColor;
    description?: string;
    primaryName?: string;
    primaryContext?: string;
    deadlineISO?: string;
    deadlineLabel?: string;
    draftIds: string[];
  }) => string;
  createDraft: (letterType: LetterTypeId, answers: LetterAnswers, mode?: Mode) => string;
  /** Spawn a draft flagged as a template authoring surface. The returned
   * draft has `isTemplateSource: true` set so the editor swaps Export
   * → Save template. `templateName` / `templateDescription` are stashed
   * on answers so the banner + first save can read them. */
  createTemplateSourceDraft: (
    letterType: LetterTypeId,
    answers: LetterAnswers,
    mode: Mode,
    meta: { templateName: string; templateDescription?: string }
  ) => string;
  updateAnswers: (id: string, answers: LetterAnswers) => void;
  /** Rename the draft's display title. Empty string clears the override
   * so the letter-type meta title takes over again. */
  setDraftTitle: (id: string, title: string) => void;
  updateSection: (id: string, sectionId: string, html: string) => void;
  appendToSection: (id: string, sectionId: string, html: string) => void;
  setSectionStatus: (id: string, sectionId: string, status: Section["status"]) => void;
  pushSectionVersion: (id: string, sectionId: string, version: SectionVersion) => void;
  /** AI proposed a change. Stores it as section.pendingChange awaiting
   * user review. Does NOT touch section.html — the old text stays put
   * until the user accepts. */
  proposeSectionChange: (id: string, sectionId: string, change: import("./letters/types").PendingChange) => void;
  /** Promote pendingChange.proposedHtml to section.html, version the old
   * one, clear pendingChange, mark section edited. */
  acceptSectionPending: (id: string, sectionId: string) => void;
  /** Drop pendingChange without applying it. */
  rejectSectionPending: (id: string, sectionId: string) => void;
  /** Accept (or reject) every pending change in the draft. */
  acceptAllPending: (id: string) => void;
  rejectAllPending: (id: string) => void;
  /** Track-changes — flip a single suggestion mark's status across all
   * sections of the draft. Used by the Accept / Reject affordances on each
   * inline pill. Does NOT rewrite the underlying text. */
  setSuggestionStatus: (
    draftId: string,
    suggestionId: string,
    status: "accepted" | "rejected" | "pending"
  ) => void;
  /** Accept every pending suggestion: walks each section, applies
   * mergeAcceptedSuggestionsHtml to fold accepted insertions in / drop
   * accepted deletions, versions the prior html, marks the section edited. */
  acceptAllSuggestions: (draftId: string) => void;
  /** Reject every pending suggestion without modifying the underlying text —
   * marks stay so the reviewer's intent is auditable. */
  rejectAllSuggestions: (draftId: string) => void;
  setSections: (id: string, sections: Section[]) => void;
  setWithoutPrejudice: (id: string, value: boolean) => void;
  setEvidence: (id: string, items: EvidenceItem[]) => void;
  recordExport: (id: string, event: Omit<ExportEvent, "id" | "exportedAt"> & { exportedAt?: number }) => void;
  /**
   * Patch context / employer / employee on a draft. Used by the
   * Edit-details slide-over to update fields the wizard captured at
   * draft creation. Recomputes serviceMonths if startDate changes.
   */
  patchDraft: (
    id: string,
    patch: {
      context?: Partial<Draft["context"]>;
      employer?: Partial<Draft["employer"]>;
      employee?: Partial<Draft["employee"]>;
      answers?: Partial<Draft["answers"]>;
    }
  ) => void;
  inviteCollaborator: (id: string, email: string, role: CollaboratorRole, name?: string) => void;
  removeCollaborator: (id: string, collaboratorId: string) => void;
  updateCollaboratorRole: (id: string, collaboratorId: string, role: CollaboratorRole) => void;
  /** explicitId: use a caller-supplied comment id (pagedly already wrote the
   *  <span data-comment-id> on the page, so the thread must share its id). */
  addComment: (id: string, comment: Omit<Comment, "id" | "createdAt">, explicitId?: string) => string;
  deleteComment: (id: string, commentId: string) => void;
  resolveComment: (id: string, commentId: string, resolved: boolean) => void;
  /** Append an AI chat message and return its id. */
  appendAIMessage: (id: string, message: Omit<AIChatMessage, "id" | "createdAt">) => string;
  /** Stream tokens into an existing assistant message (live updates). */
  appendAIMessageBody: (id: string, messageId: string, delta: string) => void;
  /** Mark an assistant message as no longer streaming + attach extracted actions. */
  finalizeAIMessage: (id: string, messageId: string, actions?: AIAction[]) => void;
  /** Update a single action's status (proposed -> applied / failed). */
  updateAIAction: (id: string, messageId: string, actionId: string, patch: Partial<AIAction>) => void;
  /** Wipe the AI chat thread for a draft. */
  clearAIChat: (id: string) => void;
  /** Append a high-signal audit event to a draft timeline. */
  recordTimelineEvent: (
    id: string,
    event: Omit<DraftTimelineEvent, "id" | "createdAt"> & { createdAt?: number }
  ) => void;
  /** Drafter action: ship the draft to a reviewer for sign-off. */
  submitForReview: (id: string, reviewerName?: string, body?: string) => void;
  /** Reviewer action: green-light the draft. Clears it to "ready to send". */
  approveDraft: (id: string, reviewerName: string, body?: string) => void;
  /** Reviewer action: push back with required changes. Returns the draft
   * to "draft" state for the author to revise. */
  requestChanges: (id: string, reviewerName: string, body: string) => void;
  /** Author action: pull a submitted draft back before review starts. */
  withdrawForReview: (id: string) => void;
  deleteDraft: (id: string) => void;
};

const PROTECTED_DEADLINE_BASIS_UK =
  "ERA s.111(2): tribunal claim must be presented within 3 months less one day of the act complained of (subject to ACAS Early Conciliation extension).";
const PROTECTED_DEADLINE_BASIS_US =
  "EEOC: 180 days from the act complained of (extended to 300 days in deferral states). State agency windows may differ.";

export const useDraftStore = create<Store>()(
  persist(
    (set, get) => ({
      drafts: {},
      matters: {},
      employees: {},
      tasks: {},
      events: {},
      customTemplates: {},

      /* ----------------------------------------------------------------
       * Custom templates — workspace-saved reusable letters. A user-named
       * snapshot of a draft's per-section HTML + answers, keyed by the
       * canonical SectionId (not the per-draft Section.id) so it can be
       * applied to a freshly-spawned outline from the same baseLetterType.
       * ---------------------------------------------------------------*/

      createCustomTemplate: (input) => {
        const id = uid("tpl");
        const now = Date.now();
        const tpl: CustomTemplate = {
          ...input,
          id,
          createdAt: now,
          updatedAt: now,
        };
        set((s) => ({ customTemplates: { ...s.customTemplates, [id]: tpl } }));
        return id;
      },

      updateCustomTemplate: (id, patch) =>
        set((s) => {
          const t = s.customTemplates[id];
          if (!t) return s;
          return {
            customTemplates: {
              ...s.customTemplates,
              [id]: { ...t, ...patch, updatedAt: Date.now() },
            },
          };
        }),

      deleteCustomTemplate: (id) =>
        set((s) => {
          if (!s.customTemplates[id]) return s;
          const { [id]: _removed, ...remaining } = s.customTemplates;
          return { customTemplates: remaining };
        }),

      createDraftFromCustomTemplate: (templateId, modeOverride) => {
        const tpl = get().customTemplates[templateId];
        if (!tpl) return null;
        // Seed answers from the template, plus jurisdiction default so
        // wizard-derived fields downstream pick the right region.
        const seededAnswers: LetterAnswers = {
          ...(tpl.answers ?? {}),
          ...(tpl.jurisdiction ? { jurisdiction: tpl.jurisdiction } : {}),
        };
        // Strip template-source-only internal fields (injected by
        // createTemplateSourceDraft). If the template was saved FROM a
        // template-source draft they ride along in tpl.answers and would
        // otherwise pollute every ordinary draft seeded from this template.
        delete (seededAnswers as Record<string, unknown>)._templateName;
        delete (seededAnswers as Record<string, unknown>)._templateDescription;
        const newDraftId = get().createDraft(
          tpl.baseLetterType,
          seededAnswers,
          modeOverride ?? tpl.mode
        );
        // Pre-fill section html from the template, keyed by canonical SectionId.
        set((s) => {
          const d = s.drafts[newDraftId];
          if (!d) return s;
          const sections = d.sections.map((sec) => {
            const html = tpl.sectionHtml[sec.sectionId];
            if (!html) return sec;
            return {
              ...sec,
              html: sanitizeLetterHtml(html),
              status: "edited" as Section["status"],
            };
          });
          return {
            drafts: { ...s.drafts, [newDraftId]: { ...d, sections, updatedAt: Date.now() } },
          };
        });
        return newDraftId;
      },

      /* ----------------------------------------------------------------
       * Employees — workspace-level normalized people directory.
       * Additive lifecycle: create / update / archive. Drafts and Matters
       * reference these by id (via Matter.participants[].employeeId). We
       * intentionally don't cascade-delete: archive flips status so
       * historical drafts keep their link, and the directory stays clean.
       * ---------------------------------------------------------------*/

      createEmployee: (input) => {
        const id = uid("emp");
        const now = Date.now();
        const employee: Employee = {
          ...input,
          id,
          createdAt: now,
          updatedAt: now,
        };
        set((s) => ({ employees: { ...s.employees, [id]: employee } }));
        return id;
      },

      updateEmployee: (id, patch) =>
        set((s) => {
          const e = s.employees[id];
          if (!e) return s;
          return {
            employees: { ...s.employees, [id]: { ...e, ...patch, updatedAt: Date.now() } },
          };
        }),

      archiveEmployee: (id) =>
        set((s) => {
          const e = s.employees[id];
          if (!e) return s;
          const now = Date.now();
          return {
            employees: {
              ...s.employees,
              [id]: {
                ...e,
                status: "left",
                endDate: e.endDate ?? todayDateOnly(),
                updatedAt: now,
              },
            },
          };
        }),

      deleteEmployee: (id) =>
        set((s) => {
          if (!s.employees[id]) return s;
          const employees = { ...s.employees };
          delete employees[id];
          // Strip the deleted employee from any matter participants so no
          // link dangles after the record is gone.
          const matters = { ...s.matters };
          let mattersChanged = false;
          const now = Date.now();
          for (const [mid, m] of Object.entries(matters)) {
            if (m.participants?.some((p) => p.employeeId === id)) {
              matters[mid] = {
                ...m,
                participants: m.participants.filter((p) => p.employeeId !== id),
                updatedAt: now,
              };
              mattersChanged = true;
            }
          }
          return mattersChanged ? { employees, matters } : { employees };
        }),

      /* ----------------------------------------------------------------
       * Tasks — actionable next steps tied to a Matter.
       * ---------------------------------------------------------------*/

      createTask: (input) => {
        const id = uid("task");
        const now = Date.now();
        const task: Task = {
          ...input,
          id,
          createdAt: now,
          updatedAt: now,
        };
        set((s) => ({ tasks: { ...s.tasks, [id]: task } }));
        return id;
      },

      updateTask: (id, patch) =>
        set((s) => {
          const t = s.tasks[id];
          if (!t) return s;
          return {
            tasks: { ...s.tasks, [id]: { ...t, ...patch, updatedAt: Date.now() } },
          };
        }),

      completeTask: (id) =>
        set((s) => {
          const t = s.tasks[id];
          if (!t) return s;
          const now = Date.now();
          return {
            tasks: {
              ...s.tasks,
              [id]: { ...t, status: "done", doneAt: now, updatedAt: now },
            },
          };
        }),

      deleteTask: (id) =>
        set((s) => {
          if (!s.tasks[id]) return s;
          const { [id]: _removed, ...remaining } = s.tasks;
          return { tasks: remaining };
        }),

      /* ----------------------------------------------------------------
       * Events — meetings / hearings / deadlines on a Matter calendar.
       * ---------------------------------------------------------------*/

      createEvent: (input) => {
        const id = uid("evt");
        const now = Date.now();
        const event: MatterEvent = {
          ...input,
          id,
          createdAt: now,
        };
        set((s) => ({ events: { ...s.events, [id]: event } }));
        return id;
      },

      updateEvent: (id, patch) =>
        set((s) => {
          const e = s.events[id];
          if (!e) return s;
          return {
            events: { ...s.events, [id]: { ...e, ...patch } },
          };
        }),

      deleteEvent: (id) =>
        set((s) => {
          if (!s.events[id]) return s;
          const { [id]: _removed, ...remaining } = s.events;
          return { events: remaining };
        }),

      /* ----------------------------------------------------------------
       * Matters lifecycle
       *
       * Pure record updates — no draft-side cascading on delete (we keep
       * orphan drafts intact so the user can re-assign). archive vs delete:
       *   archive() flips status to "archived" — still listed in the
       *     index under a "Show archived" toggle, drafts retain matterId.
       *   delete() removes the matter entirely AND clears matterId from
       *     every draft that pointed at it.
       * ---------------------------------------------------------------*/

      createMatter: (input) => {
        const id = uid("matter");
        const now = Date.now();
        const matter: Matter = {
          id,
          name: input.name.trim(),
          mode: input.mode,
          status: "active",
          color: input.color,
          description: input.description,
          parties: input.primaryName
            ? { primaryName: input.primaryName, primaryContext: input.primaryContext }
            : undefined,
          deadlineISO: input.deadlineISO,
          deadlineLabel: input.deadlineLabel,
          counselReviewed: input.counselReviewed ?? false,
          createdAt: now,
          updatedAt: now,
        };
        set((s) => ({ matters: { ...s.matters, [id]: matter } }));
        return id;
      },

      updateMatter: (id, patch) =>
        set((s) => {
          const m = s.matters[id];
          if (!m) return s;
          return {
            matters: { ...s.matters, [id]: { ...m, ...patch, updatedAt: Date.now() } },
          };
        }),

      closeMatter: (id) =>
        set((s) => {
          const m = s.matters[id];
          if (!m) return s;
          return {
            matters: { ...s.matters, [id]: { ...m, status: "closed", updatedAt: Date.now() } },
          };
        }),

      archiveMatter: (id) =>
        set((s) => {
          const m = s.matters[id];
          if (!m) return s;
          return {
            matters: {
              ...s.matters,
              [id]: {
                ...m,
                status: "archived",
                archivedAt: Date.now(),
                updatedAt: Date.now(),
              },
            },
          };
        }),

      deleteMatter: (id) => {
        // Remote deletes come only from this explicit action, never from a
        // matter vanishing out of state (rehydrate, workspace swap).
        if (get().matters[id]) void _dualWriteDeleteMatterRemotely(id);
        set((s) => {
          if (!s.matters[id]) return s;
          // Pull the matter out and clear matterId from any draft pointing at it.
          const { [id]: _removed, ...remaining } = s.matters;
          const drafts: Record<string, Draft> = {};
          for (const [draftId, d] of Object.entries(s.drafts)) {
            drafts[draftId] = d.matterId === id ? { ...d, matterId: undefined } : d;
          }
          // Also drop tasks/events scoped to this matter — otherwise they
          // leak in the store forever (invisible, and would re-surface if a
          // new matter ever reused the id). Mirrors the draft cleanup above.
          const tasks = Object.fromEntries(
            Object.entries(s.tasks).filter(([, t]) => t.matterId !== id),
          );
          const events = Object.fromEntries(
            Object.entries(s.events).filter(([, e]) => e.matterId !== id),
          );
          return { matters: remaining, drafts, tasks, events };
        });
      },

      addMatterParticipant: (matterId, participant) =>
        set((s) => {
          const m = s.matters[matterId];
          if (!m) return s;
          const existing = m.participants ?? [];
          // De-dupe by employeeId (a known employee can only be added once);
          // external parties (employeeId null) can repeat by name.
          if (
            participant.employeeId &&
            existing.some((p) => p.employeeId === participant.employeeId)
          ) {
            return s;
          }
          return {
            matters: {
              ...s.matters,
              [matterId]: {
                ...m,
                participants: [...existing, participant],
                updatedAt: Date.now(),
              },
            },
          };
        }),

      removeMatterParticipant: (matterId, index) =>
        set((s) => {
          const m = s.matters[matterId];
          if (!m?.participants || index < 0 || index >= m.participants.length) return s;
          return {
            matters: {
              ...s.matters,
              [matterId]: {
                ...m,
                participants: m.participants.filter((_, i) => i !== index),
                updatedAt: Date.now(),
              },
            },
          };
        }),

      assignDraftToMatter: (draftId, matterId) =>
        set((s) => {
          const d = s.drafts[draftId];
          if (!d) return s;
          return {
            drafts: {
              ...s.drafts,
              [draftId]: { ...d, matterId: matterId ?? undefined, updatedAt: Date.now() },
            },
          };
        }),

      upgradeGroupToMatter: (input) => {
        const id = uid("matter");
        const now = Date.now();
        const matter: Matter = {
          id,
          name: input.name.trim(),
          mode: input.mode,
          status: "active",
          color: input.color,
          description: input.description,
          parties: input.primaryName
            ? { primaryName: input.primaryName, primaryContext: input.primaryContext }
            : undefined,
          deadlineISO: input.deadlineISO,
          deadlineLabel: input.deadlineLabel,
          createdAt: now,
          updatedAt: now,
        };
        set((s) => {
          const drafts: Record<string, Draft> = { ...s.drafts };
          for (const did of input.draftIds) {
            const d = drafts[did];
            if (d) drafts[did] = { ...d, matterId: id, updatedAt: now };
          }
          return { matters: { ...s.matters, [id]: matter }, drafts };
        });
        // Suppress unused-var on get() — kept available for future enhancements
        // (e.g. deriving deadlineISO from the most-recent draft if user omitted).
        void get;
        return id;
      },

      createDraft: (letterType, answers, mode) => {
        const id = uid("draft");
        const now = Date.now();
        const meta = getLetterMeta(letterType);
        const resolvedMode: Mode = mode ?? meta.mode;

        const sections: Section[] = meta.defaultSections.map((s) => ({
          id: uid("sec"),
          sectionId: s.id,
          title: s.title,
          html: "",
          required: s.required,
          status: "empty",
          versions: [],
        }));

        const a = answers as Record<string, string | boolean | number | string[] | undefined>;
        const protectedDeadline = computeProtectedDeadline(a);

        const draft: Draft = {
          id,
          mode: resolvedMode,
          letterType,
          context: {
            mode: resolvedMode,
            jurisdiction: (a.jurisdiction as "UK" | "US") ?? "UK",
            ukRegion: a.ukRegion as Draft["context"]["ukRegion"],
            usState: a.usState as Draft["context"]["usState"],
            workerClass: (a.workerClass as Draft["context"]["workerClass"]) ?? "employee",
            letterType,
            effectiveDate: (a.effectiveDate as string) ?? (a.lastWorkingDay as string) ?? "",
            issueDate: todayDateOnly(),
            deliveryMethod:
              (a.deliveryMethod as Draft["context"]["deliveryMethod"]) ?? "email",
            tone: (a.tone as Draft["context"]["tone"]) ?? (resolvedMode === "employee" ? "formal" : "formal"),
            employeeTone:
              resolvedMode === "employee"
                ? ((a.employeeTone as Draft["context"]["employeeTone"]) ?? "assertive")
                : undefined,
            confidentiality:
              (a.confidentiality as Draft["context"]["confidentiality"]) ??
              (meta.tribunalBound ? "private_and_confidential" : "public"),
            withoutPrejudice: meta.withoutPrejudiceDefault ?? false,
            protectedCharacteristics: Array.isArray(a.protectedCharacteristics)
              ? (a.protectedCharacteristics as Draft["context"]["protectedCharacteristics"])
              : undefined,
            protectedDeadline,
            counselReviewRequired: meta.legalReviewRequired,
            riskFlags: {
              protectedStatus: Boolean(a.protectedStatus),
              grievanceLast90Days: Boolean(a.grievanceLast90Days),
              collectiveConsultation: Boolean(a.collectiveConsultation),
            },
          },
          employer: {
            legalName: (a.employerLegalName as string) ?? "",
            address: (a.employerAddress as string) ?? "",
            registrationNumber: a.employerRegNumber as string | undefined,
            hasLetterhead: Boolean(a.hasLetterhead),
            letterheadDataUrl: isSafeImageRef(a.letterheadDataUrl)
              ? a.letterheadDataUrl
              : undefined,
            signatureDataUrl: isSafeImageRef(a.signatureDataUrl)
              ? a.signatureDataUrl
              : undefined,
            // `signatoryName/Title` is mode-overloaded: in EMPLOYER mode it's
            // the letter's signatory; in EMPLOYEE mode it's the employer person
            // ADDRESSED (system.ts reads it as "Person addressed"). Employee
            // templates collect `recipientName/Title`, not `signatoryName`, so
            // the fallback is correct — NOT a bug. (Audited: no export path uses
            // this as the employee-sender's signature.)
            signatoryName:
              (a.signatoryName as string) ??
              (a.recipientName as string) ??
              "",
            signatoryTitle:
              (a.signatoryTitle as string) ??
              (a.recipientTitle as string) ??
              "",
          },
          employee: {
            legalName: (a.employeeLegalName as string) ?? "",
            preferredName: a.employeePreferredName as string | undefined,
            jobTitle: (a.employeeJobTitle as string) ?? "",
            department: a.employeeDepartment as string | undefined,
            address: (a.employeeAddress as string) ?? "",
            email: a.employeeEmail as string | undefined,
            startDate: (a.employeeStartDate as string) ?? "",
            serviceMonths: monthsBetween(a.employeeStartDate as string),
          },
          answers,
          sections,
          evidence: resolvedMode === "employee" ? [] : undefined,
          outcomeSought: a.outcomeSought as string | undefined,
          timeline: [
            timelineEvent("created", `Created ${meta.shortTitle}`, {
              createdAt: now,
              detail: `${resolvedMode === "employer" ? "HR" : "Employee"} letter · ${draftJurisdictionLabel(
                (a.jurisdiction as "UK" | "US") ?? "UK",
                a.ukRegion as Draft["context"]["ukRegion"],
                a.usState as Draft["context"]["usState"]
              )}`,
            }),
          ],
          createdAt: now,
          updatedAt: now,
        };
        set((s) => ({ drafts: { ...s.drafts, [id]: draft } }));
        return id;
      },

      createTemplateSourceDraft: (letterType, answers, mode, metaInput) => {
        const id = get().createDraft(letterType, answers, mode);
        set((s) => {
          const d = s.drafts[id];
          if (!d) return s;
          const nextAnswers: LetterAnswers = {
            ...d.answers,
            _templateName: metaInput.templateName,
            _templateDescription: metaInput.templateDescription,
          };
          return {
            drafts: {
              ...s.drafts,
              [id]: {
                ...d,
                isTemplateSource: true,
                answers: nextAnswers,
                updatedAt: Date.now(),
              },
            },
          };
        });
        return id;
      },

      updateAnswers: (id, answers) =>
        set((s) => {
          const d = s.drafts[id];
          if (!d) return s;
          return {
            drafts: { ...s.drafts, [id]: { ...d, answers, updatedAt: Date.now() } },
          };
        }),

      setDraftTitle: (id, title) =>
        set((s) => {
          const d = s.drafts[id];
          if (!d) return s;
          const trimmed = title.trim();
          // Empty string clears the override — letter-type meta title
          // takes over again on next render.
          const next: Draft = { ...d, title: trimmed || undefined, updatedAt: Date.now() };
          return { drafts: { ...s.drafts, [id]: next } };
        }),

      updateSection: (id, sectionId, html) =>
        set((s) => {
          const d = s.drafts[id];
          if (!d) return s;
          const sections = d.sections.map((sec) =>
            sec.id === sectionId
              ? {
                  ...sec,
                  html,
                  // Clearing a section (e.g. before a regenerate) leaves it
                  // empty, not "edited"; health checks and the editor badge
                  // read this status.
                  status: hasVisibleContent(html) ? ("edited" as const) : ("empty" as const),
                }
              : sec
          );
          return {
            drafts: { ...s.drafts, [id]: { ...d, sections, updatedAt: Date.now() } },
          };
        }),

      appendToSection: (id, sectionId, delta) =>
        set((s) => {
          const d = s.drafts[id];
          if (!d) return s;
          const sections = d.sections.map((sec) =>
            sec.id === sectionId
              ? { ...sec, html: sec.html + delta, status: "streaming" as const }
              : sec
          );
          return {
            drafts: { ...s.drafts, [id]: { ...d, sections, updatedAt: Date.now() } },
          };
        }),

      setSectionStatus: (id, sectionId, status) =>
        set((s) => {
          const d = s.drafts[id];
          if (!d) return s;
          const sections = d.sections.map((sec) =>
            sec.id === sectionId ? { ...sec, status } : sec
          );
          return {
            drafts: { ...s.drafts, [id]: { ...d, sections, updatedAt: Date.now() } },
          };
        }),

      pushSectionVersion: (id, sectionId, version) =>
        set((s) => {
          const d = s.drafts[id];
          if (!d) return s;
          const target = d.sections.find((sec) => sec.id === sectionId);
          const versionNumber = target ? target.versions.length + 1 : undefined;
          const sections = d.sections.map((sec) =>
            sec.id === sectionId
              ? { ...sec, versions: [...sec.versions, version] }
              : sec
          );
          return {
            drafts: {
              ...s.drafts,
              [id]: appendTimeline(
                { ...d, sections },
                timelineEvent(
                  "section_generated",
                  `${versionNumber && versionNumber > 1 ? "Regenerated" : "Generated"} ${
                    target?.title ?? "section"
                  }`,
                  {
                    createdAt: version.createdAt,
                    sectionId,
                    sectionTitle: target?.title,
                    meta: { versionId: version.id, versionNumber },
                  }
                )
              ),
            },
          };
        }),

      setSections: (id, sections) =>
        set((s) => {
          const d = s.drafts[id];
          if (!d) return s;
          return {
            drafts: {
              ...s.drafts,
              [id]: appendTimeline(
                { ...d, sections },
                timelineEvent("sections_updated", "Updated section outline", {
                  detail: `${sections.length} sections in this draft`,
                })
              ),
            },
          };
        }),

      /* ------------------------------------------------------------------
       * Pending-change lifecycle. Two render modes share this surface:
       *   - "card" (legacy): section.html stays untouched; the proposal
       *     sits in section.pendingChange and renders as a Cursor-style
       *     before/after card above the editor. Accept swaps proposedHtml
       *     in; reject just clears pendingChange.
       *   - "inline" (default): proposeSectionChange computes a sentence-
       *     level diff between section.html and proposedHtml, stages the
       *     diffed HTML (with <ins>/<del data-suggestion-id …> marks) as
       *     section.html, and snapshots the original into pendingChange.
       *     prevHtml so reject can restore it cleanly. Accept folds
       *     accepted suggestions in via mergeAcceptedSuggestionsHtml.
       * ----------------------------------------------------------------*/

      proposeSectionChange: (id, sectionId, change) =>
        set((s) => {
          const d = s.drafts[id];
          if (!d) return s;
          const target = d.sections.find((sec) => sec.id === sectionId);
          if (!target) return s;
          // Mode resolution: caller can force a mode via change.diffViewMode;
          // otherwise we read the user's preference. Defaults to inline.
          let mode = change.diffViewMode ?? getDiffViewMode();

          // The canonical text to diff against / restore on reject. If a
          // pending inline change is still open, sec.html already carries
          // <ins>/<del> marks — diffing against THAT flattens both sides and
          // corrupts prevHtml (bug #5). Use the existing pendingChange.prevHtml
          // (the clean original) as the diff base and preserve it, so a later
          // reject still restores clean text.
          const canonicalHtml =
            target.pendingChange?.prevHtml ?? target.html;

          // Inline diff rebuilds the section from flattened text (htmlToText →
          // sentences), which silently DROPS images, tables, links, and the
          // figure/attachment-ref spans that the export pipeline resolves —
          // and Accept makes that loss permanent (bug #2). When either the
          // current canonical text OR the proposal contains such non-text
          // content, fall back to card mode (Accept replaces with proposedHtml
          // verbatim — nothing is flattened).
          if (
            mode === "inline" &&
            (hasNonTextContent(canonicalHtml) ||
              hasNonTextContent(change.proposedHtml))
          ) {
            mode = "card";
          }

          // Inline mode rebuilds the section from flattened text — compute the
          // diff FIRST and refuse to stage when it produced no marks (proposal
          // textually identical to the canonical content). Staging a markless
          // diff would silently replace the section with its flattened-plain
          // rebuild (headings/lists/bold gone), which Accept makes permanent,
          // and leave a phantom card with nothing to accept.
          let inlineDiffed: string | null = null;
          if (mode === "inline") {
            inlineDiffed = sanitizeLetterHtml(
              diffHtmlAsSuggestion(canonicalHtml, change.proposedHtml, {
                // Human reviewer suggestions carry their name (set by the
                // review rail); AI proposals fall back to "Claude AI".
                author: change.authorName ?? "Claude AI",
                body: change.instruction,
              }),
            );
            if (!inlineDiffed.includes("data-suggestion-id")) return s;
          }

          const sections = d.sections.map((sec) => {
            if (sec.id !== sectionId) return sec;
            if (mode === "inline" && inlineDiffed != null) {
              // Stage the diff as section.html so the editor renders the
              // proposal as track-changes marks the user can accept /
              // reject one-at-a-time. prevHtml is the canonical text
              // we'll restore on reject-all — always the CLEAN original,
              // even when re-proposing over an unresolved pending change.
              const diffed = inlineDiffed;
              return {
                ...sec,
                html: diffed,
                pendingChange: {
                  ...change,
                  diffViewMode: "inline" as const,
                  prevHtml: canonicalHtml,
                },
              };
            }
            // Card mode — restore section.html to the clean canonical text (so
            // a prior inline proposal's marks don't linger) and surface the
            // proposal in pendingChange; PendingChangeCard reads
            // pendingChange.proposedHtml for the "after" pane.
            return {
              ...sec,
              html: canonicalHtml,
              pendingChange: { ...change, diffViewMode: "card" as const },
            };
          });
          return { drafts: { ...s.drafts, [id]: { ...d, sections, updatedAt: Date.now() } } };
        }),

      acceptSectionPending: (id, sectionId) =>
        set((s) => {
          const d = s.drafts[id];
          if (!d) return s;
          const target = d.sections.find((sec) => sec.id === sectionId);
          if (!target?.pendingChange) return s;
          const pending = target.pendingChange;
          const isInline = (pending.diffViewMode ?? "inline") === "inline";
          // For inline mode we version the snapshot taken when the diff was
          // staged (the canonical text); for card mode we version the live
          // section.html (which never changed).
          const oldVersion: SectionVersion = {
            id: pending.id + "-prev",
            createdAt: Date.now(),
            html: isInline ? (pending.prevHtml ?? target.html) : target.html,
            modelName: pending.modelName,
          };
          const acceptedHtml = isInline
            ? // Flip every pending suggestion to accepted (DOM-based — attr
              // order after a pagedly round-trip is not ours to rely on),
              // then merge to fold the additions in / drop the removals.
              sanitizeLetterHtml(acceptPendingSuggestionsHtml(target.html))
            : sanitizeLetterHtml(pending.proposedHtml);
          const sections = d.sections.map((sec) =>
            sec.id === sectionId
              ? {
                  ...sec,
                  html: acceptedHtml,
                  status: "edited" as Section["status"],
                  versions: [...sec.versions, oldVersion],
                  pendingChange: undefined,
                }
              : sec
          );
          return { drafts: { ...s.drafts, [id]: { ...d, sections, updatedAt: Date.now() } } };
        }),

      rejectSectionPending: (id, sectionId) =>
        set((s) => {
          const d = s.drafts[id];
          if (!d) return s;
          const sections = d.sections.map((sec) => {
            if (sec.id !== sectionId || !sec.pendingChange) return sec;
            const pending = sec.pendingChange;
            const isInline = (pending.diffViewMode ?? "inline") === "inline";
            return {
              ...sec,
              // Inline mode mutated section.html. Rebuild the rejected text
              // FROM THE LIVE html (drop pending <ins>, unwrap pending <del>)
              // rather than restoring the prevHtml snapshot wholesale — the
              // author may have edited prose AROUND the pending marks on the
              // review page, and a snapshot restore would destroy those
              // edits. Falls back to the snapshot when the live html has no
              // marks left to strip. Card mode never touched section.html.
              html: rejectedInlineHtml(sec.html, pending.prevHtml, isInline),
              pendingChange: undefined,
            };
          });
          return { drafts: { ...s.drafts, [id]: { ...d, sections, updatedAt: Date.now() } } };
        }),

      acceptAllPending: (id) =>
        set((s) => {
          const d = s.drafts[id];
          if (!d) return s;
          const now = Date.now();
          const sections = d.sections.map((sec) => {
            if (!sec.pendingChange) return sec;
            const pending = sec.pendingChange;
            const isInline = (pending.diffViewMode ?? "inline") === "inline";
            const oldVersion: SectionVersion = {
              id: pending.id + "-prev",
              createdAt: now,
              html: isInline ? (pending.prevHtml ?? sec.html) : sec.html,
              modelName: pending.modelName,
            };
            const acceptedHtml = isInline
              ? sanitizeLetterHtml(acceptPendingSuggestionsHtml(sec.html))
              : sanitizeLetterHtml(pending.proposedHtml);
            return {
              ...sec,
              html: acceptedHtml,
              status: "edited" as Section["status"],
              versions: [...sec.versions, oldVersion],
              pendingChange: undefined,
            };
          });
          return { drafts: { ...s.drafts, [id]: { ...d, sections, updatedAt: now } } };
        }),

      rejectAllPending: (id) =>
        set((s) => {
          const d = s.drafts[id];
          if (!d) return s;
          const sections = d.sections.map((sec) => {
            if (!sec.pendingChange) return sec;
            const pending = sec.pendingChange;
            const isInline = (pending.diffViewMode ?? "inline") === "inline";
            return {
              ...sec,
              // See rejectSectionPending: rebuild from the live html so the
              // author's around-the-marks edits survive the rejection.
              html: rejectedInlineHtml(sec.html, pending.prevHtml, isInline),
              pendingChange: undefined,
            };
          });
          return { drafts: { ...s.drafts, [id]: { ...d, sections, updatedAt: Date.now() } } };
        }),

      /* ------------------------------------------------------------------
       * Track-changes (Suggestion mark) lifecycle. The mark lives inside
       * section.html as <ins data-suggestion-id=…> / <del …>. These
       * actions either flip a single mark's status across all sections
       * (setSuggestionStatus) or fan-out across the whole draft (accept-
       * all merges marks destructively, reject-all leaves marks intact
       * but flips them visually muted).
       * ----------------------------------------------------------------*/

      setSuggestionStatus: (draftId, suggestionId, status) =>
        set((s) => {
          const d = s.drafts[draftId];
          if (!d) return s;
          // Rewrite data-status on any <ins>/<del> that owns this id. Done
          // per opening tag (attribute order independent) because we only
          // touch one attribute; DOMParser would pay reparse cost on every
          // keystroke if the rail batches calls.
          let touched = false;
          const sections = d.sections.map((sec) => {
            if (!sec.html?.includes("data-suggestion-id")) return sec;
            const next = rewriteSuggestionStatus(sec.html, (sid) => sid === suggestionId, null, status);
            if (next === sec.html) return sec;
            touched = true;
            return { ...sec, html: next };
          });
          if (!touched) return s;
          return {
            drafts: { ...s.drafts, [draftId]: { ...d, sections, updatedAt: Date.now() } },
          };
        }),

      acceptAllSuggestions: (draftId) =>
        set((s) => {
          const d = s.drafts[draftId];
          if (!d) return s;
          let touched = false;
          const now = Date.now();
          const sections = d.sections.map((sec) => {
            if (!hasPendingSuggestions(sec.html)) return sec;
            // Flip pending → accepted, then merge to fold accepted edits in.
            const flipped = rewriteSuggestionStatus(sec.html, () => true, "pending", "accepted");
            const merged = sanitizeLetterHtml(mergeAcceptedSuggestionsHtml(flipped));
            const oldVersion: SectionVersion = {
              id: `suggestion-accept-${sec.id}-${now}`,
              createdAt: now,
              html: sec.html,
            };
            touched = true;
            return {
              ...sec,
              html: merged,
              status: "edited" as Section["status"],
              versions: [...sec.versions, oldVersion],
            };
          });
          if (!touched) return s;
          return {
            drafts: { ...s.drafts, [draftId]: { ...d, sections, updatedAt: now } },
          };
        }),

      rejectAllSuggestions: (draftId) =>
        set((s) => {
          const d = s.drafts[draftId];
          if (!d) return s;
          let touched = false;
          const sections = d.sections.map((sec) => {
            if (!hasPendingSuggestions(sec.html)) return sec;
            const next = rewriteSuggestionStatus(sec.html, () => true, "pending", "rejected");
            if (next === sec.html) return sec;
            touched = true;
            return { ...sec, html: next };
          });
          if (!touched) return s;
          return {
            drafts: { ...s.drafts, [draftId]: { ...d, sections, updatedAt: Date.now() } },
          };
        }),

      setWithoutPrejudice: (id, value) =>
        set((s) => {
          const d = s.drafts[id];
          if (!d) return s;
          return {
            drafts: {
              ...s.drafts,
              [id]: appendTimeline(
                { ...d, context: { ...d.context, withoutPrejudice: value } },
                timelineEvent(
                  "without_prejudice_updated",
                  value ? "Enabled without-prejudice header" : "Disabled without-prejudice header"
                )
              ),
            },
          };
        }),

      setEvidence: (id, items) =>
        set((s) => {
          const d = s.drafts[id];
          if (!d) return s;
          return {
            drafts: {
              ...s.drafts,
              [id]: appendTimeline(
                { ...d, evidence: items },
                timelineEvent("evidence_updated", "Updated evidence and attachments", {
                  detail: `${items.length} item${items.length === 1 ? "" : "s"}`,
                })
              ),
            },
          };
        }),

      recordExport: (id, event) =>
        set((s) => {
          const d = s.drafts[id];
          if (!d) return s;
          const e: ExportEvent = {
            id: uid("ex"),
            exportedAt: event.exportedAt ?? Date.now(),
            format: event.format,
            reviewedBy: event.reviewedBy,
            reviewedOn: event.reviewedOn,
          };
          return {
            drafts: {
              ...s.drafts,
              [id]: appendTimeline(
                { ...d, exports: [...(d.exports ?? []), e] },
                timelineEvent("exported", `Exported as ${e.format.toUpperCase()}`, {
                  createdAt: e.exportedAt,
                  detail: e.reviewedBy ? `Counsel review attested by ${e.reviewedBy}` : undefined,
                  meta: {
                    exportId: e.id,
                    format: e.format,
                    reviewedBy: e.reviewedBy,
                    reviewedOn: e.reviewedOn,
                  },
                })
              ),
            },
          };
        }),

      patchDraft: (id, patch) =>
        set((s) => {
          const d = s.drafts[id];
          if (!d) return s;
          const employee = patch.employee ? { ...d.employee, ...patch.employee } : d.employee;
          const startDate = patch.employee?.startDate ?? d.employee.startDate;
          const context = patch.context || patch.answers ? { ...d.context, ...patch.context } : d.context;
          const answers = patch.answers ? { ...d.answers, ...patch.answers } : d.answers;
          // The limitation deadline depends on jurisdiction, US state and the
          // act date, any of which Edit Details can change. Recompute it so
          // the calendar, banner and notifications don't keep the old date.
          if (patch.context || patch.answers) {
            context.protectedDeadline = computeProtectedDeadline({
              ...(answers as Record<string, string | boolean | number | string[] | undefined>),
              jurisdiction: context.jurisdiction,
              usState: context.usState,
            });
          }
          return {
            drafts: {
              ...s.drafts,
              [id]: appendTimeline(
                {
                  ...d,
                  context,
                  employer: patch.employer ? { ...d.employer, ...patch.employer } : d.employer,
                  employee: {
                    ...employee,
                    serviceMonths:
                      patch.employee?.startDate !== undefined
                        ? monthsBetween(startDate)
                        : employee.serviceMonths,
                  },
                  answers,
                },
                timelineEvent("details_updated", "Updated draft details", {
                  detail: detailsPatchSummary(patch),
                })
              ),
            },
          };
        }),

      inviteCollaborator: (id, email, role, name) =>
        set((s) => {
          const d = s.drafts[id];
          if (!d) return s;
          const trimmed = email.trim().toLowerCase();
          if (!trimmed) return s;
          const existing = d.collaborators ?? [];
          if (existing.some((c) => c.email === trimmed)) return s;
          const c: Collaborator = {
            id: uid("col"),
            email: trimmed,
            name: name?.trim() || undefined,
            role,
            status: "pending",
            invitedAt: Date.now(),
          };
          return {
            drafts: {
              ...s.drafts,
              [id]: appendTimeline(
                { ...d, collaborators: [...existing, c] },
                timelineEvent("collaborator_invited", `Invited ${name?.trim() || trimmed}`, {
                  detail: `${role} access`,
                  actorName: name?.trim() || trimmed,
                  meta: { collaboratorId: c.id, role },
                })
              ),
            },
          };
        }),

      removeCollaborator: (id, collaboratorId) =>
        set((s) => {
          const d = s.drafts[id];
          if (!d) return s;
          const removed = (d.collaborators ?? []).find((c) => c.id === collaboratorId);
          return {
            drafts: {
              ...s.drafts,
              [id]: appendTimeline(
                {
                  ...d,
                  collaborators: (d.collaborators ?? []).filter((c) => c.id !== collaboratorId),
                },
                timelineEvent(
                  "collaborator_removed",
                  `Removed ${removed?.name || removed?.email || "collaborator"}`,
                  { meta: { collaboratorId } }
                )
              ),
            },
          };
        }),

      updateCollaboratorRole: (id, collaboratorId, role) =>
        set((s) => {
          const d = s.drafts[id];
          if (!d) return s;
          const updated = (d.collaborators ?? []).find((c) => c.id === collaboratorId);
          return {
            drafts: {
              ...s.drafts,
              [id]: appendTimeline(
                {
                  ...d,
                  collaborators: (d.collaborators ?? []).map((c) =>
                    c.id === collaboratorId ? { ...c, role } : c
                  ),
                },
                timelineEvent(
                  "collaborator_role_updated",
                  `Changed ${updated?.name || updated?.email || "collaborator"} role`,
                  { detail: role, meta: { collaboratorId, role } }
                )
              ),
            },
          };
        }),

      addComment: (id, c, explicitId) => {
        const newId = explicitId ?? uid("cmt");
        set((s) => {
          const d = s.drafts[id];
          if (!d) return s;
          const now = Date.now();
          const comment: Comment = { ...c, id: newId, createdAt: now, updatedAt: now };
          const section = d.sections.find((sec) => sec.id === c.sectionId);
          return {
            drafts: {
              ...s.drafts,
              [id]: appendTimeline(
                { ...d, comments: [...(d.comments ?? []), comment] },
                timelineEvent("comment_added", c.parentId ? "Replied to comment" : "Added comment", {
                  createdAt: comment.createdAt,
                  actorName: c.authorName,
                  sectionId: c.sectionId,
                  sectionTitle: section?.title,
                  detail: truncateTimelineText(c.body),
                  meta: { commentId: newId, parentId: c.parentId },
                })
              ),
            },
          };
        });
        return newId;
      },

      deleteComment: (id, commentId) =>
        set((s) => {
          const d = s.drafts[id];
          if (!d) return s;
          const target = (d.comments ?? []).find((c) => c.id === commentId);
          // Strip <mark data-comment-id={commentId}> from the section HTML so
          // the inline highlight disappears alongside the thread.
          const nextSections = stripMark(d.sections, target?.sectionId, commentId);
          // Remove the comment AND any replies under it, leaving tombstones so
          // the delete syncs and another device can't bring them back.
          const removed = (d.comments ?? []).filter(
            (c) => c.id === commentId || c.parentId === commentId
          );
          const next = (d.comments ?? []).filter(
            (c) => c.id !== commentId && c.parentId !== commentId
          );
          const deletedAt = Date.now();
          const known = new Set((d.commentTombstones ?? []).map((t) => t.id));
          const commentTombstones = [
            ...(d.commentTombstones ?? []),
            ...removed.filter((c) => !known.has(c.id)).map((c) => ({ id: c.id, deletedAt })),
          ];
          const section = d.sections.find((sec) => sec.id === target?.sectionId);
          return {
            drafts: {
              ...s.drafts,
              [id]: appendTimeline(
                { ...d, comments: next, commentTombstones, sections: nextSections },
                timelineEvent("comment_deleted", "Deleted comment", {
                  actorName: target?.authorName,
                  sectionId: target?.sectionId,
                  sectionTitle: section?.title,
                  detail: target ? truncateTimelineText(target.body) : undefined,
                  meta: { commentId },
                })
              ),
            },
          };
        }),

      resolveComment: (id, commentId, resolved) =>
        set((s) => {
          const d = s.drafts[id];
          if (!d) return s;
          const target = (d.comments ?? []).find((c) => c.id === commentId);
          // Resolved comments lose their inline highlight (clean reading view).
          // The user can toggle "Show resolved" in the rail to see them again.
          // Unresolving doesn't restore the highlight automatically — by then
          // the section HTML may have been edited; safer to leave the quote
          // visible only in the panel.
          const nextSections =
            resolved && target?.sectionId
              ? stripMark(d.sections, target.sectionId, commentId)
              : d.sections;
          const section = d.sections.find((sec) => sec.id === target?.sectionId);
          return {
            drafts: {
              ...s.drafts,
              [id]: appendTimeline(
                {
                  ...d,
                  // updatedAt makes the newer resolve / reopen win on sync.
                  comments: (d.comments ?? []).map((c) =>
                    c.id === commentId
                      ? { ...c, resolved, updatedAt: Date.now(), resolvedAt: resolved ? Date.now() : undefined }
                      : c
                  ),
                  sections: nextSections,
                },
                timelineEvent(
                  "comment_resolved",
                  resolved ? "Resolved comment" : "Reopened comment",
                  {
                    actorName: target?.authorName,
                    sectionId: target?.sectionId,
                    sectionTitle: section?.title,
                    detail: target ? truncateTimelineText(target.body) : undefined,
                    meta: { commentId, resolved },
                  }
                )
              ),
            },
          };
        }),

      appendAIMessage: (id, m) => {
        const newId = uid("ai");
        set((s) => {
          const d = s.drafts[id];
          if (!d) return s;
          const message: AIChatMessage = { ...m, id: newId, createdAt: Date.now() };
          return {
            drafts: {
              ...s.drafts,
              [id]: { ...d, aiChat: [...(d.aiChat ?? []), message], updatedAt: Date.now() },
            },
          };
        });
        return newId;
      },

      appendAIMessageBody: (id, messageId, delta) =>
        set((s) => {
          const d = s.drafts[id];
          if (!d) return s;
          return {
            drafts: {
              ...s.drafts,
              [id]: {
                ...d,
                aiChat: (d.aiChat ?? []).map((m) =>
                  m.id === messageId ? { ...m, body: m.body + delta } : m
                ),
              },
            },
          };
        }),

      finalizeAIMessage: (id, messageId, actions) =>
        set((s) => {
          const d = s.drafts[id];
          if (!d) return s;
          return {
            drafts: {
              ...s.drafts,
              [id]: {
                ...d,
                aiChat: (d.aiChat ?? []).map((m) =>
                  m.id === messageId ? { ...m, streaming: false, actions: actions ?? m.actions } : m
                ),
                updatedAt: Date.now(),
              },
            },
          };
        }),

      updateAIAction: (id, messageId, actionId, patch) =>
        set((s) => {
          const d = s.drafts[id];
          if (!d) return s;
          return {
            drafts: {
              ...s.drafts,
              [id]: {
                ...d,
                aiChat: (d.aiChat ?? []).map((m) =>
                  m.id === messageId
                    ? {
                        ...m,
                        actions: m.actions?.map((a) =>
                          a.id === actionId ? { ...a, ...patch } : a
                        ),
                      }
                    : m
                ),
                updatedAt: Date.now(),
              },
            },
          };
        }),

      clearAIChat: (id) =>
        set((s) => {
          const d = s.drafts[id];
          if (!d) return s;
          return {
            drafts: {
              ...s.drafts,
              [id]: appendTimeline(
                { ...d, aiChat: [] },
                timelineEvent("ai_cleared", "Cleared AI chat thread")
              ),
            },
          };
        }),

      recordTimelineEvent: (id, event) =>
        set((s) => {
          const d = s.drafts[id];
          if (!d) return s;
          return {
            drafts: {
              ...s.drafts,
              [id]: appendTimeline(d, timelineEvent(event.kind, event.title, event)),
            },
          };
        }),

      /* ----------------------------------------------------------------
       * Approval workflow — Business-tier review queue.
       * Status machine: draft → in_review → (approved | changes_requested → draft).
       * Every transition logs an ApprovalEntry on draft.approvals[] AND a
       * timeline event so existing Activity surfaces pick it up for free.
       * ---------------------------------------------------------------*/

      submitForReview: (id, reviewerName, body) =>
        set((s) => {
          const d = s.drafts[id];
          if (!d) return s;
          const now = Date.now();
          const reviewer = (reviewerName ?? "").trim() || "Workspace reviewer";
          const entry: ApprovalEntry = {
            id: uid("apr"),
            reviewerName: reviewer,
            decision: "submitted",
            body: body?.trim() || undefined,
            createdAt: now,
          };
          return {
            drafts: {
              ...s.drafts,
              [id]: appendTimeline(
                {
                  ...d,
                  reviewStatus: "in_review",
                  submittedForReviewAt: now,
                  approvals: [...(d.approvals ?? []), entry],
                },
                timelineEvent("review_submitted", `Submitted for review to ${reviewer}`, {
                  createdAt: now,
                  detail: entry.body,
                  actorName: reviewer,
                  meta: { approvalId: entry.id },
                })
              ),
            },
          };
        }),

      approveDraft: (id, reviewerName, body) =>
        set((s) => {
          const d = s.drafts[id];
          if (!d) return s;
          const now = Date.now();
          const reviewer = reviewerName.trim() || "Workspace reviewer";
          const entry: ApprovalEntry = {
            id: uid("apr"),
            reviewerName: reviewer,
            decision: "approved",
            body: body?.trim() || undefined,
            createdAt: now,
          };
          return {
            drafts: {
              ...s.drafts,
              [id]: appendTimeline(
                {
                  ...d,
                  reviewStatus: "approved",
                  reviewDecidedAt: now,
                  approvals: [...(d.approvals ?? []), entry],
                },
                timelineEvent("review_approved", `Approved by ${reviewer}`, {
                  createdAt: now,
                  detail: entry.body,
                  actorName: reviewer,
                  meta: { approvalId: entry.id },
                })
              ),
            },
          };
        }),

      requestChanges: (id, reviewerName, body) =>
        set((s) => {
          const d = s.drafts[id];
          if (!d) return s;
          const now = Date.now();
          const reviewer = reviewerName.trim() || "Workspace reviewer";
          const entry: ApprovalEntry = {
            id: uid("apr"),
            reviewerName: reviewer,
            decision: "changes_requested",
            body: body.trim(),
            createdAt: now,
          };
          return {
            drafts: {
              ...s.drafts,
              [id]: appendTimeline(
                {
                  ...d,
                  reviewStatus: "changes_requested",
                  reviewDecidedAt: now,
                  approvals: [...(d.approvals ?? []), entry],
                },
                timelineEvent("review_changes_requested", `Changes requested by ${reviewer}`, {
                  createdAt: now,
                  detail: entry.body,
                  actorName: reviewer,
                  meta: { approvalId: entry.id },
                })
              ),
            },
          };
        }),

      withdrawForReview: (id) =>
        set((s) => {
          const d = s.drafts[id];
          if (!d) return s;
          if (d.reviewStatus !== "in_review") return s;
          return {
            drafts: {
              ...s.drafts,
              [id]: appendTimeline(
                {
                  ...d,
                  reviewStatus: "draft",
                  submittedForReviewAt: undefined,
                },
                timelineEvent("review_withdrawn", "Withdrew from review")
              ),
            },
          };
        }),

      deleteDraft: (id) => {
        // The only place a remote draft delete is issued. Inferring deletes
        // from drafts disappearing out of state let a cross-tab rehydrate
        // (e.g. while this tab's writes were failing on a full storage quota)
        // delete drafts on the server.
        if (get().drafts[id]) void _dualWriteDeleteDraftRemotely(id);
        set((s) => {
          const next = { ...s.drafts };
          delete next[id];
          return { drafts: next };
        });
      },
    }),
    {
      name: "scribehr-store-v1",
      // Quota-safe storage: strips the redundant raw image data URLs from
      // each draft's `answers` blob before writing (the validated
      // `employer.*DataUrl` is the render source of truth), and surfaces a
      // toast instead of silently failing if a write still overflows quota.
      storage: createJSONStorage(() =>
        createQuotaSafeStorage(
          typeof window !== "undefined"
            ? window.localStorage
            : { getItem: () => null, setItem: () => {}, removeItem: () => {} },
          () =>
            toast.error("Your browser storage is full", {
              description:
                "Recent changes may not be saved on this device. Remove a large letterhead/signature image or export and delete old letters to free space.",
            }),
          {
            // Coalesce bursts (streaming AI output changes the store on every
            // token) into at most two writes a second.
            throttleMs: 500,
            estimateUsage: () =>
              typeof window !== "undefined" ? estimateLocalStorageBytes(window.localStorage) : 0,
          },
        ),
      ),
      // A rehydrate (another tab wrote) replaces state with what's on disk.
      // When this tab's own writes are failing on quota (or still waiting on
      // the throttle), disk is BEHIND memory, so keep this tab's newer and
      // not-yet-persisted drafts instead of silently dropping them.
      merge: (persisted, current) => mergePersistedDrafts(persisted, current, hasUnpersistedWrites()),
    }
  )
);

/** Persist merge for useDraftStore. Exported for tests. */
export function mergePersistedDrafts<T extends { drafts: Record<string, Draft> }>(
  persisted: unknown,
  current: T,
  memoryAhead: boolean,
): T {
  const p = (persisted ?? {}) as Partial<T>;
  const merged = { ...current, ...p } as T;
  if (!memoryAhead || !p.drafts) return merged;
  const drafts: Record<string, Draft> = { ...p.drafts };
  for (const [id, d] of Object.entries(current.drafts)) {
    const onDisk = drafts[id];
    if (!onDisk || d.updatedAt > onDisk.updatedAt) drafts[id] = d;
  }
  return { ...merged, drafts };
}

// Cross-tab coherence (senior sweep I-SYNC-1). The persist middleware writes to
// localStorage but does NOT listen for writes from OTHER tabs — so two tabs on
// one machine silently clobber each other's drafts through localStorage with no
// server round-trip. A `storage` event fires in every OTHER tab when our key
// changes; re-hydrate from it so the tabs converge. Cheap, immediate win; the
// real multi-DEVICE reconcile (pull/merge) is the larger strategic item.
if (typeof window !== "undefined") {
  const PERSIST_KEY = "scribehr-store-v1";
  window.addEventListener("storage", (e) => {
    if (!e.key) return;
    // Another tab switched this device to a different workspace's local data.
    // Reload rather than rehydrate, so this tab can't persist the previous
    // workspace's in-memory state over it.
    if (e.key === WORKSPACE_SWAP_KEY) {
      window.location.assign("/");
      return;
    }
    // Another tab signed out / switched workspace → it WIPED a tenant-scoped
    // key. Tear this tab down too, so it can't keep the previous tenant's PII
    // in memory and re-persist it under the wiped key for the next user (board
    // SI-01 — the cross-tab counterpart to the sign-out wipe). A hard
    // navigation re-initialises every store from the now-cleared storage; the
    // session check on reload then routes to /sign-in or the new tenant.
    if (
      e.newValue === null &&
      (TENANT_SCOPED_PERSIST_KEYS as readonly string[]).includes(e.key)
    ) {
      window.location.assign("/");
      return;
    }
    // Same-key cross-tab edit (not a wipe): rehydrate so the tabs converge.
    if (e.key === PERSIST_KEY && e.newValue !== null) {
      // rehydrate() re-reads localStorage and replaces in-memory state.
      void useDraftStore.persist?.rehydrate?.();
    }
  });
}

// Dual-write hook: subscribe to the store and enqueue a debounced server
// sync per draft whenever its identity changes. No-op when the flag is off.
// We register a snapshot getter so dual-write.ts can read drafts without
// importing the store module (avoids a circular import).
import {
  enqueueSync as _dualWriteEnqueueSync,
  deleteDraftRemotely as _dualWriteDeleteDraftRemotely,
  deleteMatterRemotely as _dualWriteDeleteMatterRemotely,
  enqueueMatterSync as _dualWriteEnqueueMatterSync,
  setDualWriteSnapshotGetter as _setDualWriteSnapshotGetter,
  setDualWriteMatterGetter as _setDualWriteMatterGetter,
  setDualWriteStoreBridge as _setDualWriteStoreBridge,
  isDualWriteEnabled as _isDualWriteEnabled,
  syncDraft as _dualWriteSyncDraft,
} from "./dual-write";
import {
  applyRemoteDraft as _applyRemoteDraft,
  mergeExtrasIntoDraft as _mergeExtrasIntoDraft,
} from "./remote-pull";

_setDualWriteSnapshotGetter((draftId) => useDraftStore.getState().drafts[draftId] ?? null);
_setDualWriteMatterGetter((matterId) => useDraftStore.getState().matters[matterId] ?? null);

// The draft fields that reach the server (draft row + extras). A draft whose
// object changed but whose synced fields are all the same references (AI chat
// streaming, evidence, exports) needs no sync at all; dual-write then skips
// anything whose content key matches what the server last accepted, so a
// cross-tab rehydrate (every object new, same content) re-sends nothing.
const SYNCED_DRAFT_FIELDS = [
  "letterType",
  "mode",
  "title",
  "context",
  "employer",
  "employee",
  "answers",
  "sections",
  "reviewStatus",
  "matterId",
  "isTemplateSource",
  "templateSourceId",
  "comments",
  "commentTombstones",
  "timeline",
  "approvals",
  "outcomeSought",
] as const satisfies readonly (keyof Draft)[];

export function syncedFieldsChanged(prev: Draft | undefined, next: Draft): boolean {
  if (!prev) return true;
  return SYNCED_DRAFT_FIELDS.some((k) => prev[k] !== next[k]);
}

/** A local-only copy of a draft holding this device's version after a sync
 *  conflict. Never synced, so it can't spend a letter credit. */
export function conflictCopyOf(draft: Draft, now = Date.now()): Draft {
  const baseTitle = draft.title?.trim() || getLetterMeta(draft.letterType)?.title || "Letter";
  return {
    ...draft,
    id: uid("draft"),
    title: `${baseTitle} (conflicted copy)`,
    localOnly: true,
    reviewStatus: "draft",
    approvals: [],
    submittedForReviewAt: undefined,
    reviewDecidedAt: undefined,
    createdAt: now,
    updatedAt: now,
  };
}

_setDualWriteStoreBridge({
  applyServerDraft: (localId, remote) => {
    const existing = useDraftStore.getState().drafts[localId];
    if (!existing) return null;
    const next = _applyRemoteDraft(existing, remote);
    useDraftStore.setState((s) => ({ drafts: { ...s.drafts, [localId]: next } }));
    return next;
  },
  setReviewStatus: (localId, status) =>
    useDraftStore.setState((s) => {
      const d = s.drafts[localId];
      if (!d) return s;
      return { drafts: { ...s.drafts, [localId]: { ...d, reviewStatus: status } } };
    }),
  addConflictCopy: (draft) => {
    const copy = conflictCopyOf(draft);
    useDraftStore.setState((s) => ({ drafts: { ...s.drafts, [copy.id]: copy } }));
    return copy.id;
  },
  keepLocalOnly: (localId) =>
    useDraftStore.setState((s) => {
      const d = s.drafts[localId];
      if (!d) return s;
      return { drafts: { ...s.drafts, [localId]: { ...d, localOnly: true } } };
    }),
  removeLocally: (localId) =>
    useDraftStore.setState((s) => {
      if (!s.drafts[localId]) return s;
      const next = { ...s.drafts };
      delete next[localId];
      return { drafts: next };
    }),
  applyExtras: (localId, extras) =>
    useDraftStore.setState((s) => {
      const d = s.drafts[localId];
      if (!d) return s;
      const next = _mergeExtrasIntoDraft(d, extras);
      return next === d ? s : { drafts: { ...s.drafts, [localId]: next } };
    }),
});

if (_isDualWriteEnabled()) {
  let prevDrafts = useDraftStore.getState().drafts;
  let prevMatters = useDraftStore.getState().matters;
  useDraftStore.subscribe((state) => {
    const next = state.drafts;
    if (next !== prevDrafts) {
      for (const [id, draft] of Object.entries(next)) {
        if (prevDrafts[id] !== draft && !draft.localOnly && syncedFieldsChanged(prevDrafts[id], draft)) {
          _dualWriteEnqueueSync(id);
        }
      }
      // Deletions are NOT inferred here: deleteDraft issues the remote delete
      // itself. A draft can leave state for reasons that must never delete it
      // on the server (another tab's rehydrate, a remote tombstone, a
      // workspace swap).
      prevDrafts = next;
    }

    // Matters: debounce-sync any create/update so matter-only edits (rename /
    // close / archive / counsel-reviewed) reach the server (bug #16). Remote
    // deletes come from deleteMatter only, for the same reason as drafts.
    const nextMatters = state.matters;
    if (nextMatters !== prevMatters) {
      for (const [id, matter] of Object.entries(nextMatters)) {
        if (prevMatters[id] !== matter) {
          _dualWriteEnqueueMatterSync(id);
        }
      }
      prevMatters = nextMatters;
    }
  });
}

// Re-export so callers (App.tsx backfill) can avoid duplicating imports.
export const __dualWrite = { syncDraft: _dualWriteSyncDraft };

function timelineEvent(
  kind: DraftTimelineEvent["kind"],
  title: string,
  options: Partial<DraftTimelineEvent> = {}
): DraftTimelineEvent {
  const {
    id: _id,
    kind: _kind,
    title: _title,
    createdAt,
    ...rest
  } = options;
  return {
    id: uid("evt"),
    kind,
    title,
    createdAt: createdAt ?? Date.now(),
    ...rest,
  };
}

function appendTimeline(draft: Draft, event: DraftTimelineEvent): Draft {
  return {
    ...draft,
    timeline: [...(draft.timeline ?? []), event].slice(-500),
    updatedAt: Date.now(),
  };
}

function detailsPatchSummary(patch: Parameters<Store["patchDraft"]>[1]): string | undefined {
  const parts: string[] = [];
  if (patch.context) parts.push("letter settings");
  if (patch.employer) parts.push("employer details");
  if (patch.employee) parts.push("employee details");
  if (patch.answers) parts.push("wizard answers");
  return parts.length > 0 ? parts.join(", ") : undefined;
}

function draftJurisdictionLabel(
  jurisdiction: Draft["context"]["jurisdiction"],
  ukRegion?: Draft["context"]["ukRegion"],
  usState?: Draft["context"]["usState"]
): string {
  if (jurisdiction === "UK") return ukRegion ? `UK · ${ukRegion}` : "UK";
  return usState ? `US · ${usState}` : "US";
}

function truncateTimelineText(text: string, max = 120): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max - 1).trim()}…`;
}

// Exported for unit testing (the day-of-month boundary gates statutory
// service thresholds, so it's worth proving directly).
export function monthsBetween(isoDate?: string): number {
  if (!isoDate) return 0;
  const start = parseDateOnly(isoDate);
  const now = new Date();
  if (!start) return 0;
  // Count COMPLETED months of service, not calendar-month boundaries crossed.
  // If today's day-of-month is before the start day, the current month hasn't
  // completed yet — otherwise we'd credit a full month the instant the month
  // number ticks over, pushing employees over statutory thresholds (e.g. the
  // 2-year redundancy-pay line) up to ~a month early.
  let months =
    (now.getFullYear() - start.getFullYear()) * 12 +
    (now.getMonth() - start.getMonth());
  // Clamp the anniversary day to the last day of the evaluation month: when the
  // start day-of-month doesn't exist in this month (e.g. started the 31st, now
  // in a 30-day month), the service month completes on the month's last day, not
  // on a non-existent later date. Comparing against the raw start day would
  // under-credit a completed month for anyone who started on the 29th–31st.
  const lastDayOfNowMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const anniversaryDay = Math.min(start.getDate(), lastDayOfNowMonth);
  if (now.getDate() < anniversaryDay) months -= 1;
  return Math.max(0, months);
}

function computeProtectedDeadline(
  a: Record<string, string | boolean | number | string[] | undefined>
): Draft["context"]["protectedDeadline"] | undefined {
  const actDate = a.actDate as string | undefined;
  if (!actDate) return undefined;
  if (!parseDateOnly(actDate)) return undefined;

  const jurisdiction = a.jurisdiction as "UK" | "US" | undefined;
  if (jurisdiction === "UK") {
    return {
      iso: addDaysToDateOnly(addMonthsToDateOnly(actDate, 3), -1),
      basis: PROTECTED_DEADLINE_BASIS_UK,
    };
  }
  if (jurisdiction === "US") {
    // 300 days only where a state FEP agency shares the charge (deferral
    // states). Without a known deferral state, show the shorter 180-day
    // window: an early warning is safe, a late one can lose the claim.
    const state = a.usState as string | undefined;
    const days = state && !EEOC_NON_DEFERRAL_STATES.has(state) ? 300 : 180;
    return {
      iso: addDaysToDateOnly(actDate, days),
      basis: PROTECTED_DEADLINE_BASIS_US,
    };
  }
  return undefined;
}

/** States with no state FEP agency, so the EEOC 180-day window applies. */
const EEOC_NON_DEFERRAL_STATES = new Set(["AL", "AR", "GA", "MS", "NC"]);

/**
 * Strip the `<mark data-comment-id={commentId}>` wrapper from a single
 * section's HTML, preserving the inner text. Used when a comment is
 * deleted or resolved — the inline highlight should disappear alongside.
 *
 * Tolerates extra attributes inside the <mark> tag and arbitrary nested
 * inline content. Returns the original sections array if no change.
 */
/**
 * True when HTML carries content the inline sentence-diff would silently lose:
 * images, tables, hyperlinks, or the figure/attachment-reference spans the
 * export pipeline resolves to numbered exhibits. The inline diff rebuilds a
 * section from flattened text, so any of these must route through card mode
 * (which replaces with the proposal verbatim on accept). Cheap string probe
 * first; falls back to a regex scan when no DOM is available.
 */
function hasNonTextContent(html: string): boolean {
  if (!html) return false;
  // Fast path: none of the markers present → plain text, inline diff is safe.
  if (
    !/<img\b/i.test(html) &&
    !/<table\b/i.test(html) &&
    !/<a\b[^>]*\bhref=/i.test(html) &&
    !/\bdata-fig-id=/i.test(html) &&
    !/\bdata-att-id=/i.test(html) &&
    !/class="(?:figure-ref|attachment-ref)"/i.test(html) &&
    // Structure and formatting the sentence diff flattens to plain <p>s, and
    // comment anchors it drops (orphaning the thread).
    !/<(?:h[1-6]|ul|ol|blockquote|strong|b|em|i|u)\b/i.test(html) &&
    !/\bdata-comment-id=/i.test(html)
  ) {
    return false;
  }
  return true;
}

/**
 * The rejected form of an inline-diffed section: drop pending <ins> (with
 * text — it was never canonical), unwrap pending <del> (the original text
 * stays). Built FROM THE LIVE html so prose the author edited around the
 * pending marks on the review page survives the rejection; the prevHtml
 * snapshot is only the fallback for html that carries no marks (or card
 * mode, where isInline is false and section.html was never touched).
 */
function rejectedInlineHtml(
  liveHtml: string,
  prevHtml: string | undefined,
  isInline: boolean,
): string {
  if (!isInline) return liveHtml;
  if (liveHtml.includes("data-suggestion-id")) {
    // Authoring-mode merge: pending insertions removed, pending deletions
    // unwrapped (kept) — exactly "reject everything pending".
    const merged = sanitizeLetterHtml(mergeAcceptedSuggestionsHtml(liveHtml));
    // The staged diff is a flattened rebuild, so the merge loses whatever
    // formatting the original had. When nothing was edited around the marks
    // (same text as the snapshot), restore the snapshot instead.
    if (prevHtml && plainText(merged) === plainText(prevHtml)) return prevHtml;
    return merged;
  }
  return prevHtml ?? liveHtml;
}

/**
 * Set data-status on <ins>/<del> suggestion marks whose id passes `match`
 * (and whose current status is `from`, when given). Works per opening tag so
 * attribute order doesn't matter: a pagedly round-trip can put data-status
 * before data-suggestion-id, which the old single regex silently skipped.
 */
function rewriteSuggestionStatus(
  html: string,
  match: (suggestionId: string) => boolean,
  from: string | null,
  to: string,
): string {
  return html.replace(/<(?:ins|del)\b[^>]*>/gi, (tag) => {
    const id = /\bdata-suggestion-id="([^"]+)"/.exec(tag)?.[1];
    if (!id || !match(id)) return tag;
    const current = /\bdata-status="([^"]*)"/.exec(tag)?.[1];
    if (current === undefined) return tag;
    if (from !== null && current !== from) return tag;
    return tag.replace(/\bdata-status="[^"]*"/, `data-status="${to}"`);
  });
}

function hasVisibleContent(html: string): boolean {
  if (!html) return false;
  if (/<img\b/i.test(html)) return true;
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim() !== "";
}

function plainText(html: string): string {
  const el = document.createElement("div");
  el.innerHTML = html;
  return (el.textContent ?? "").replace(/\s+/g, " ").trim();
}

function stripMark(
  sections: Section[],
  sectionId: string | undefined,
  commentId: string
): Section[] {
  if (!sectionId) return sections;
  const idx = sections.findIndex((s) => s.id === sectionId);
  if (idx < 0) return sections;
  const target = sections[idx];
  if (!target.html) return sections;
  // Unwrap via the DOM, not a regex. CommentMark has `excludes: ""`, so two
  // comments on overlapping/nested ranges render as nested <mark> elements; a
  // non-greedy `([\s\S]*?)</mark>` regex stops at the FIRST </mark> and
  // mis-pairs the tags, dragging trailing text into a surviving comment's
  // highlight. Matching the attribute on a parsed tree pairs tags correctly.
  const root = document.createElement("div");
  root.innerHTML = target.html;
  let changed = false;
  // Tiptap writes <mark data-comment-id>; the pagedly review surface writes
  // <span class="pagedly-comment" data-comment-id>. Unwrap either.
  root.querySelectorAll("[data-comment-id]").forEach((el) => {
    if (el.getAttribute("data-comment-id") !== commentId) return;
    const parent = el.parentNode;
    if (!parent) return;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
    changed = true;
  });
  if (!changed) return sections; // no match → leave HTML untouched (no reserialize)
  const updated = [...sections];
  updated[idx] = { ...target, html: root.innerHTML };
  return updated;
}
