/**
 * Presentation helpers shared by the Letters list and Home: how a draft is
 * labelled, which pastel it wears, which status pill it shows and its
 * health score. Read-only views over the draft; no business logic lives here.
 */
import { format } from "date-fns";
import type { Draft, LetterTypeId } from "@/lib/letters/types";
import {
  getLetterMeta,
  categoryOf,
  LETTER_CATEGORIES,
  type LetterCategoryId,
  type LetterTypeMeta,
} from "@/lib/letters/catalog";
import { computeHealthScore, runHealthChecks } from "@/lib/finalize/healthChecks";

export type Tint = "lavender" | "mint" | "peach" | "butter" | "sky" | "rose";

const TINT_BY_CATEGORY: Record<LetterCategoryId, Tint> = {
  performance_conduct: "lavender",
  dispute: "peach",
  compensation: "mint",
  leave: "sky",
  departure: "rose",
  onboarding: "butter",
  tribunal_legal: "lavender",
};

/** CSS custom properties that paint a pastel: `--tint` and `--tint-ink`. */
export function tintStyle(tint: Tint): React.CSSProperties {
  return {
    ["--tint" as string]: `var(--ds-tint-${tint})`,
    ["--tint-ink" as string]: `var(--ds-tint-${tint}-ink)`,
  };
}

export function tintForLetterType(id: LetterTypeId): Tint {
  const cat = categoryOf(id);
  return cat ? TINT_BY_CATEGORY[cat] : "sky";
}

export function categoryLabel(id: LetterTypeId): string | undefined {
  const cat = categoryOf(id);
  return LETTER_CATEGORIES.find((c) => c.id === cat)?.label;
}

export function safeLetterMeta(id: LetterTypeId | string): LetterTypeMeta | null {
  try {
    return getLetterMeta(id as LetterTypeId);
  } catch {
    return null;
  }
}

/** Same label the sidebar's recent letters use. */
export function letterLabel(d: Draft): string {
  return (
    d.title?.trim() ||
    safeLetterMeta(d.letterType)?.shortTitle ||
    d.letterType.replace(/_/g, " ")
  );
}

/** "Jordan Hale" for HR letters, "to Harbour Foods Ltd" for employee ones. */
export function letterParty(d: Draft): string {
  return d.mode === "employer"
    ? d.employee.legalName || "(no recipient)"
    : `to ${d.employer.legalName || "(employer)"}`;
}

export function isSent(d: Draft): boolean {
  return (d.exports?.length ?? 0) > 0;
}

export type LetterBucket = "approval" | "draft" | "sent";

/** Which Letters tab a draft sits under. In review wins over sent. */
export function letterBucket(d: Draft): LetterBucket {
  if (d.reviewStatus === "in_review") return "approval";
  if (isSent(d)) return "sent";
  return "draft";
}

export type StatusTone = "warn" | "info" | "neutral" | "ok" | "danger";
export type LetterStatus = { label: string; tone: StatusTone };

function writingState(d: Draft): "empty" | "drafting" | "ready" {
  const all = d.sections;
  if (all.length === 0) return "empty";
  if (all.every((s) => s.status === "empty" && !s.html)) return "empty";
  if (all.every((s) => s.status === "ready")) return "ready";
  return "drafting";
}

export function letterStatus(d: Draft, viewerCanApprove: boolean): LetterStatus {
  if (d.sections.some((s) => s.status === "streaming")) return { label: "Drafting", tone: "info" };
  switch (d.reviewStatus) {
    case "in_review":
      return {
        label: viewerCanApprove ? "Needs your approval" : "Awaiting approval",
        tone: "warn",
      };
    case "changes_requested":
      return { label: "Changes requested", tone: "danger" };
    case "approved":
      if (!isSent(d)) return { label: "Approved", tone: "ok" };
      break;
  }
  if (isSent(d)) return { label: "Sent", tone: "ok" };
  const w = writingState(d);
  if (w === "ready") return { label: "Ready to send", tone: "info" };
  if (w === "drafting") return { label: "Draft", tone: "neutral" };
  return { label: "Not started", tone: "neutral" };
}

/** 0-100 health score, or null while there is nothing written to score. */
export function letterHealth(d: Draft): number | null {
  if (writingState(d) === "empty") return null;
  try {
    return computeHealthScore(runHealthChecks(d)).score;
  } catch {
    return null;
  }
}

/** Rough page count from the written text, for the stacked thumbnail. */
export function letterIsLong(d: Draft): boolean {
  let chars = 0;
  for (const s of d.sections) chars += s.html?.length ?? 0;
  return chars > 3200;
}

/** "Just now", "4 min ago", "3 hr ago", "Yesterday", "3 Oct". */
export function updatedLabel(ts: number, now = Date.now()): string {
  const diff = Math.max(0, now - ts);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  if (h < 48) return "Yesterday";
  const d = new Date(ts);
  return new Date(now).getFullYear() === d.getFullYear()
    ? format(d, "d MMM")
    : format(d, "d MMM yyyy");
}
