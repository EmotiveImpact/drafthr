import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  AIAction,
  AIChatMessage,
  Collaborator,
  CollaboratorRole,
  Comment,
  Draft,
  DraftTimelineEvent,
  EvidenceItem,
  ExportEvent,
  LetterAnswers,
  LetterTypeId,
  Mode,
  Section,
  SectionVersion,
} from "./letters/types";
import { uid } from "./utils";
import { getLetterMeta } from "./letters/catalog";
import {
  addDaysToDateOnly,
  addMonthsToDateOnly,
  parseDateOnly,
  todayDateOnly,
} from "./date-only";

type Store = {
  drafts: Record<string, Draft>;
  createDraft: (letterType: LetterTypeId, answers: LetterAnswers, mode?: Mode) => string;
  updateAnswers: (id: string, answers: LetterAnswers) => void;
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
  addComment: (id: string, comment: Omit<Comment, "id" | "createdAt">) => string;
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
  deleteDraft: (id: string) => void;
};

const PROTECTED_DEADLINE_BASIS_UK =
  "ERA s.111(2): tribunal claim must be presented within 3 months less one day of the act complained of (subject to ACAS Early Conciliation extension).";
const PROTECTED_DEADLINE_BASIS_US =
  "EEOC: 180 days from the act complained of (extended to 300 days in deferral states). State agency windows may differ.";

export const useDraftStore = create<Store>()(
  persist(
    (set) => ({
      drafts: {},

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
            letterheadDataUrl: a.letterheadDataUrl as string | undefined,
            signatureDataUrl: a.signatureDataUrl as string | undefined,
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

      updateAnswers: (id, answers) =>
        set((s) => {
          const d = s.drafts[id];
          if (!d) return s;
          return {
            drafts: { ...s.drafts, [id]: { ...d, answers, updatedAt: Date.now() } },
          };
        }),

      updateSection: (id, sectionId, html) =>
        set((s) => {
          const d = s.drafts[id];
          if (!d) return s;
          const sections = d.sections.map((sec) =>
            sec.id === sectionId ? { ...sec, html, status: "edited" as const } : sec
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
       * Pending-change (Cursor-style diff) lifecycle.
       * proposeSectionChange stores an AI proposal without touching the
       * section's current html. acceptSectionPending promotes it (versions
       * the old html into section.versions, swaps in proposedHtml, marks
       * status "edited"). rejectSectionPending just clears the pending
       * record. *AcceptAll / *RejectAll fan over every section.
       * ----------------------------------------------------------------*/

      proposeSectionChange: (id, sectionId, change) =>
        set((s) => {
          const d = s.drafts[id];
          if (!d) return s;
          const sections = d.sections.map((sec) =>
            sec.id === sectionId ? { ...sec, pendingChange: change } : sec
          );
          return { drafts: { ...s.drafts, [id]: { ...d, sections, updatedAt: Date.now() } } };
        }),

      acceptSectionPending: (id, sectionId) =>
        set((s) => {
          const d = s.drafts[id];
          if (!d) return s;
          const target = d.sections.find((sec) => sec.id === sectionId);
          if (!target?.pendingChange) return s;
          const oldVersion: SectionVersion = {
            id: target.pendingChange.id + "-prev",
            createdAt: Date.now(),
            html: target.html,
            modelName: target.pendingChange.modelName,
          };
          const sections = d.sections.map((sec) =>
            sec.id === sectionId
              ? {
                  ...sec,
                  html: sec.pendingChange!.proposedHtml,
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
          const sections = d.sections.map((sec) =>
            sec.id === sectionId ? { ...sec, pendingChange: undefined } : sec
          );
          return { drafts: { ...s.drafts, [id]: { ...d, sections, updatedAt: Date.now() } } };
        }),

      acceptAllPending: (id) =>
        set((s) => {
          const d = s.drafts[id];
          if (!d) return s;
          const sections = d.sections.map((sec) => {
            if (!sec.pendingChange) return sec;
            const oldVersion: SectionVersion = {
              id: sec.pendingChange.id + "-prev",
              createdAt: Date.now(),
              html: sec.html,
              modelName: sec.pendingChange.modelName,
            };
            return {
              ...sec,
              html: sec.pendingChange.proposedHtml,
              status: "edited" as Section["status"],
              versions: [...sec.versions, oldVersion],
              pendingChange: undefined,
            };
          });
          return { drafts: { ...s.drafts, [id]: { ...d, sections, updatedAt: Date.now() } } };
        }),

      rejectAllPending: (id) =>
        set((s) => {
          const d = s.drafts[id];
          if (!d) return s;
          const sections = d.sections.map((sec) =>
            sec.pendingChange ? { ...sec, pendingChange: undefined } : sec
          );
          return { drafts: { ...s.drafts, [id]: { ...d, sections, updatedAt: Date.now() } } };
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
          return {
            drafts: {
              ...s.drafts,
              [id]: appendTimeline(
                {
                  ...d,
                  context: patch.context ? { ...d.context, ...patch.context } : d.context,
                  employer: patch.employer ? { ...d.employer, ...patch.employer } : d.employer,
                  employee: {
                    ...employee,
                    serviceMonths:
                      patch.employee?.startDate !== undefined
                        ? monthsBetween(startDate)
                        : employee.serviceMonths,
                  },
                  answers: patch.answers ? { ...d.answers, ...patch.answers } : d.answers,
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

      addComment: (id, c) => {
        const newId = uid("cmt");
        set((s) => {
          const d = s.drafts[id];
          if (!d) return s;
          const comment: Comment = { ...c, id: newId, createdAt: Date.now() };
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
          // Remove the comment AND any replies under it.
          const next = (d.comments ?? []).filter(
            (c) => c.id !== commentId && c.parentId !== commentId
          );
          const section = d.sections.find((sec) => sec.id === target?.sectionId);
          return {
            drafts: {
              ...s.drafts,
              [id]: appendTimeline(
                { ...d, comments: next, sections: nextSections },
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
                  comments: (d.comments ?? []).map((c) =>
                    c.id === commentId ? { ...c, resolved } : c
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

      deleteDraft: (id) =>
        set((s) => {
          const next = { ...s.drafts };
          delete next[id];
          return { drafts: next };
        }),
    }),
    { name: "scribehr-store-v1" }
  )
);

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

function monthsBetween(isoDate?: string): number {
  if (!isoDate) return 0;
  const start = parseDateOnly(isoDate);
  const now = new Date();
  if (!start) return 0;
  return Math.max(
    0,
    (now.getFullYear() - start.getFullYear()) * 12 +
      (now.getMonth() - start.getMonth())
  );
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
    return {
      iso: addDaysToDateOnly(actDate, 300),
      basis: PROTECTED_DEADLINE_BASIS_US,
    };
  }
  return undefined;
}

/**
 * Strip the `<mark data-comment-id={commentId}>` wrapper from a single
 * section's HTML, preserving the inner text. Used when a comment is
 * deleted or resolved — the inline highlight should disappear alongside.
 *
 * Tolerates extra attributes inside the <mark> tag and arbitrary nested
 * inline content. Returns the original sections array if no change.
 */
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
  const escaped = commentId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `<mark[^>]*data-comment-id="${escaped}"[^>]*>([\\s\\S]*?)</mark>`,
    "g"
  );
  const next = target.html.replace(re, "$1");
  if (next === target.html) return sections;
  const updated = [...sections];
  updated[idx] = { ...target, html: next };
  return updated;
}
