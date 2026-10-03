import type { Draft } from "./letters/types";
import { getLetterMeta } from "./letters/catalog";
import { rulesFor, ruleMatches } from "./letters/compliance";
import { getDraftReadiness } from "./finalize/readiness";
import type { Profile } from "./profile";
import { getUnverifiedDeadlineReminder, UNVERIFIED_DEADLINE_NOTICE } from "./deadline-reminders";
import {
  daysUntilDateOnly,
  formatDateOnly,
} from "./date-only";

export type NotificationSeverity = "urgent" | "warn" | "info";

export type NotificationKind =
  | "tribunal_deadline"
  | "acas_ec_deadline"
  | "counsel_review_pending"
  | "compliance_gap"
  | "profile_incomplete"
  | "stale_draft"
  | "wp_no_header";

export type Notification = {
  id: string;
  severity: NotificationSeverity;
  kind: NotificationKind;
  title: string;
  description: string;
  /** Sort key — higher = more urgent / more recent */
  weight: number;
  draftId?: string;
  actionLabel?: string;
  actionHref?: string;
};

/**
 * Pure deriver: given the current store state, return the notifications a user
 * should see. Mirrors how a server-side notifications table would be built
 * later — but works today against in-memory data, no backend required.
 */
export function deriveNotifications(
  drafts: Draft[],
  profile: Profile,
  now: number = Date.now()
): Notification[] {
  const out: Notification[] = [];

  // Profile incomplete (low-stakes, info)
  if (profile.autoFill && !profile.setupComplete) {
    out.push({
      id: "profile_incomplete",
      severity: "info",
      kind: "profile_incomplete",
      title: "Set up your profile",
      description:
        "Auto-fill is on but your profile is empty. Save your details once and skip re-typing them on every letter.",
      weight: 10,
      actionLabel: "Open settings",
      actionHref: "/settings",
    });
  }

  for (const d of drafts) {
    const meta = safeMeta(d.letterType);
    const label = meta?.shortTitle ?? d.letterType.replace(/_/g, " ");
    const fullText = d.sections.map((s) => s.html).join("\n");

    // 1) Historical recorded reminder approaching, not a verified legal deadline.
    const dl = getUnverifiedDeadlineReminder(d);
    if (dl) {
      const days = daysUntilDateOnly(dl.iso, new Date(now));
      if (days >= 0 && days <= 21) {
        out.push({
          id: `tribunal-${d.id}`,
          severity: days < 7 ? "urgent" : days < 14 ? "warn" : "info",
          kind: "tribunal_deadline",
          title: `Recorded deadline in ${days} day${days === 1 ? "" : "s"}`,
          description: `${label}: recorded date ${formatDate(dl.iso)}. ${UNVERIFIED_DEADLINE_NOTICE}`,
          weight: 1000 - days,
          draftId: d.id,
          actionLabel: "Open draft",
          actionHref: `/editor/${d.id}`,
        });
      }
      // Acas notification is not a fixed number of days before a claim deadline.
      // The claim, notification and certificate dates determine the applicable
      // rules. Do not invent a second legal deadline from a stored reminder.
      // Source: https://www.acas.org.uk/early-conciliation/how-early-conciliation-works
      if (d.context.jurisdiction === "UK") {
        if (days >= 0 && days <= 21) {
          out.push({
            id: `acas-${d.id}`,
            severity: days < 7 ? "urgent" : "warn",
            kind: "acas_ec_deadline",
            title: "Check Acas notification requirements",
            description: `${label}: check whether early conciliation applies and when you must notify Acas. Notification and certificate dates can affect the claim deadline; do not calculate it by subtracting a fixed number of weeks. Check current Acas guidance or obtain legal advice.`,
            weight: 950 - days,
            draftId: d.id,
            actionLabel: "Open draft",
            actionHref: `/editor/${d.id}`,
          });
        }
      }
    }

    // 3) Counsel review pending — high-risk draft, content drafted, no review yet
    const readiness = getDraftReadiness(d);
    const sectionsReady = readiness.editingComplete;
    if (
      readiness.counsel.required &&
      sectionsReady &&
      !readiness.counsel.attested
    ) {
      out.push({
        id: `review-${d.id}`,
        severity: "warn",
        kind: "counsel_review_pending",
        title: "Counsel review needed before export",
        description: `${label} is fully drafted but hasn't been reviewed by a qualified employment lawyer. The export gate will request attestation.`,
        weight: 700,
        draftId: d.id,
        actionLabel: "Open draft",
        actionHref: `/editor/${d.id}`,
      });
    }

    // 4) Compliance gap — required rules missing on a sufficiently-drafted letter
    if (sectionsReady) {
      const rules = rulesFor(d.letterType, d.context.jurisdiction, d.context.usState);
      const missingRequired = rules.filter(
        (r) => r.severity === "required" && !ruleMatches(r, fullText)
      );
      if (missingRequired.length > 0) {
        out.push({
          id: `gap-${d.id}`,
          severity: "warn",
          kind: "compliance_gap",
          title: `${missingRequired.length} required clause${missingRequired.length === 1 ? "" : "s"} missing`,
          description: `${label}: ${missingRequired
            .slice(0, 2)
            .map((r) => r.label)
            .join(", ")}${missingRequired.length > 2 ? "…" : ""}. Compliance rail has the full list.`,
          weight: 500,
          draftId: d.id,
          actionLabel: "Fix in editor",
          actionHref: `/editor/${d.id}`,
        });
      }
    }

    // 5) Stale draft — not touched in 30+ days, never exported
    const idleDays = Math.floor((now - d.updatedAt) / 86400000);
    if (idleDays >= 30 && (d.exports?.length ?? 0) === 0) {
      out.push({
        id: `stale-${d.id}`,
        severity: "info",
        kind: "stale_draft",
        title: `${label} idle for ${idleDays} days`,
        description: "If you no longer need this draft, archive it. Otherwise pick it up to keep the audit trail current.",
        weight: 50 - Math.min(idleDays, 50),
        draftId: d.id,
        actionLabel: "Open draft",
        actionHref: `/editor/${d.id}`,
      });
    }
  }

  out.sort((a, b) => b.weight - a.weight);
  return out;
}

/** Convenience: highest severity present in a notifications list. */
export function topSeverity(ns: Notification[]): NotificationSeverity | null {
  if (ns.some((n) => n.severity === "urgent")) return "urgent";
  if (ns.some((n) => n.severity === "warn")) return "warn";
  if (ns.length > 0) return "info";
  return null;
}

function safeMeta(id: string) {
  try {
    return getLetterMeta(id as Parameters<typeof getLetterMeta>[0]);
  } catch {
    return null;
  }
}

function formatDate(iso: string): string {
  return formatDateOnly(iso, { day: "numeric", month: "short", year: "numeric" });
}
