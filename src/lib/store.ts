import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  Draft,
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

type Store = {
  drafts: Record<string, Draft>;
  createDraft: (letterType: LetterTypeId, answers: LetterAnswers, mode?: Mode) => string;
  updateAnswers: (id: string, answers: LetterAnswers) => void;
  updateSection: (id: string, sectionId: string, html: string) => void;
  appendToSection: (id: string, sectionId: string, html: string) => void;
  setSectionStatus: (id: string, sectionId: string, status: Section["status"]) => void;
  pushSectionVersion: (id: string, sectionId: string, version: SectionVersion) => void;
  setSections: (id: string, sections: Section[]) => void;
  setWithoutPrejudice: (id: string, value: boolean) => void;
  setEvidence: (id: string, items: EvidenceItem[]) => void;
  recordExport: (id: string, event: Omit<ExportEvent, "id" | "exportedAt"> & { exportedAt?: number }) => void;
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
            issueDate: new Date().toISOString().slice(0, 10),
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
          createdAt: Date.now(),
          updatedAt: Date.now(),
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
          const sections = d.sections.map((sec) =>
            sec.id === sectionId
              ? { ...sec, versions: [...sec.versions, version] }
              : sec
          );
          return {
            drafts: { ...s.drafts, [id]: { ...d, sections, updatedAt: Date.now() } },
          };
        }),

      setSections: (id, sections) =>
        set((s) => {
          const d = s.drafts[id];
          if (!d) return s;
          return {
            drafts: { ...s.drafts, [id]: { ...d, sections, updatedAt: Date.now() } },
          };
        }),

      setWithoutPrejudice: (id, value) =>
        set((s) => {
          const d = s.drafts[id];
          if (!d) return s;
          return {
            drafts: {
              ...s.drafts,
              [id]: {
                ...d,
                context: { ...d.context, withoutPrejudice: value },
                updatedAt: Date.now(),
              },
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
              [id]: { ...d, evidence: items, updatedAt: Date.now() },
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
              [id]: {
                ...d,
                exports: [...(d.exports ?? []), e],
                updatedAt: Date.now(),
              },
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
    { name: "hr-letter-store-v1" }
  )
);

function monthsBetween(isoDate?: string): number {
  if (!isoDate) return 0;
  const start = new Date(isoDate);
  const now = new Date();
  if (Number.isNaN(start.getTime())) return 0;
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
  const d = new Date(actDate);
  if (Number.isNaN(d.getTime())) return undefined;

  const jurisdiction = a.jurisdiction as "UK" | "US" | undefined;
  if (jurisdiction === "UK") {
    // 3 months less one day from act
    const deadline = new Date(d);
    deadline.setMonth(deadline.getMonth() + 3);
    deadline.setDate(deadline.getDate() - 1);
    return {
      iso: deadline.toISOString().slice(0, 10),
      basis: PROTECTED_DEADLINE_BASIS_UK,
    };
  }
  if (jurisdiction === "US") {
    // 300 days conservatively (deferral-state default)
    const deadline = new Date(d);
    deadline.setDate(deadline.getDate() + 300);
    return {
      iso: deadline.toISOString().slice(0, 10),
      basis: PROTECTED_DEADLINE_BASIS_US,
    };
  }
  return undefined;
}
