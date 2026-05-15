/**
 * EvidenceHandoff — confirmation modal shown before the user clicks Review →
 * when the draft fails one of the soft evidence checks:
 *
 *   - Evidence has unused items (uploaded but never cited in any section)
 *   - Tier is "heavy" but evidence count is < 2
 *
 * Three actions:
 *   - Open Evidence drawer (returns to the editor with the drawer open)
 *   - Don't ask for this draft (silences the check for this draft only)
 *   - Continue to Review →
 *
 * The "don't ask" toggle persists in localStorage per draft, mirroring the
 * `scribehr-evidence-pinned:{draftId}` pattern used by the pinned-rail state.
 */

import * as Dialog from "@radix-ui/react-dialog";
import { Paperclip, ArrowRight, AlertTriangle, X } from "lucide-react";
import type { Draft } from "@/lib/letters/types";

export type EvidenceHandoffReason =
  | { kind: "unused"; unusedFilenames: string[]; total: number; usedCount: number }
  | { kind: "heavy-low-count"; count: number };

/* ---------------------------------------------------------------------------
 * Pure check — returns null when the user is free to proceed.
 * Callers wire this to the Review CTA: if `null`, navigate directly; if a
 * reason object, open the handoff modal instead.
 * ------------------------------------------------------------------------ */
export function evaluateEvidenceHandoff(
  draft: Draft,
  tier: "light" | "medium" | "heavy" | undefined
): EvidenceHandoffReason | null {
  if (tier === "light") return null;
  if (handoffSilencedFor(draft.id)) return null;

  const items = draft.evidence ?? [];

  // Build the set of evidence ids referenced anywhere in section HTML.
  const cited = new Set<string>();
  for (const section of draft.sections) {
    const html = section.html ?? "";
    const figRe = /data-fig-id="([^"]+)"/g;
    const attRe = /data-att-id="([^"]+)"/g;
    let m;
    while ((m = figRe.exec(html))) cited.add(m[1]);
    while ((m = attRe.exec(html))) cited.add(m[1]);
  }

  const unused = items.filter((i) => !cited.has(i.id));

  // 1) Heavy tier with too little evidence — surface first because it's a
  //    structural concern, not just an audit-trail nag.
  if (tier === "heavy" && items.length < 2) {
    return { kind: "heavy-low-count", count: items.length };
  }

  // 2) Unused-evidence check applies to medium + heavy.
  if (unused.length > 0) {
    return {
      kind: "unused",
      unusedFilenames: unused
        .map((i) => i.filename || labelForKind(i.kind))
        .slice(0, 5),
      total: items.length,
      usedCount: items.length - unused.length,
    };
  }

  return null;
}

function labelForKind(kind: string): string {
  switch (kind) {
    case "email":
      return "Email";
    case "calendar":
      return "Calendar entry";
    case "document":
      return "Document";
    case "screenshot":
      return "Screenshot";
    case "note":
      return "Note";
    default:
      return "Evidence";
  }
}

/* ---------------------------------------------------------------------------
 * Persistence for "Don't ask for this draft".
 * ------------------------------------------------------------------------ */
const SILENCE_KEY = (draftId: string) => `scribehr-evidence-handoff-silenced:${draftId}`;

function handoffSilencedFor(draftId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SILENCE_KEY(draftId)) === "1";
  } catch {
    return false;
  }
}

function silenceHandoffFor(draftId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SILENCE_KEY(draftId), "1");
  } catch {
    /* localStorage might be unavailable — silently no-op */
  }
}

/* ---------------------------------------------------------------------------
 * Modal component
 * ------------------------------------------------------------------------ */
export function EvidenceHandoff({
  open,
  reason,
  draftId,
  onOpenChange,
  onOpenDrawer,
  onContinue,
}: {
  open: boolean;
  reason: EvidenceHandoffReason | null;
  draftId: string;
  onOpenChange: (next: boolean) => void;
  /** Called when the user clicks "Open Evidence drawer". */
  onOpenDrawer: () => void;
  /** Called when the user clicks "Continue to Review →". */
  onContinue: () => void;
}) {
  if (!reason) return null;

  const onDontAsk = () => {
    silenceHandoffFor(draftId);
    onOpenChange(false);
    onContinue();
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px]" />
        <Dialog.Content className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[480px] max-w-[calc(100vw-2rem)] rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] shadow-[0_24px_48px_rgba(15,17,21,0.16)] p-5">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-2.5">
              <div
                className="size-9 rounded-lg grid place-items-center bg-[var(--ds-amber-bg)] text-[var(--ds-amber-fg)] shrink-0"
                aria-hidden
              >
                <AlertTriangle className="size-[18px]" />
              </div>
              <div>
                <Dialog.Title className="m-0 text-[15px] font-semibold leading-tight">
                  Evidence check before Review
                </Dialog.Title>
                <Dialog.Description className="text-[11.5px] text-[var(--ds-muted)] mt-0.5">
                  Quick look at your supporting evidence.
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="size-7 rounded-md grid place-items-center text-[var(--ds-muted)] hover:bg-[var(--ds-line-2)] hover:text-[var(--ds-ink)]"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </Dialog.Close>
          </div>

          <div className="text-[13px] text-[var(--ds-ink)] leading-relaxed mb-5">
            {reason.kind === "unused" ? (
              <UnusedBody reason={reason} />
            ) : (
              <HeavyLowCountBody reason={reason} />
            )}
          </div>

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onDontAsk}
              className="text-[11.5px] text-[var(--ds-muted)] hover:text-[var(--ds-ink)] transition"
            >
              Don&rsquo;t ask for this draft
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  onOpenChange(false);
                  onOpenDrawer();
                }}
                className="h-8 px-3 rounded-md border border-[var(--ds-line)] bg-white text-[12px] font-semibold text-[var(--ds-ink)] hover:bg-[var(--ds-line-2)] inline-flex items-center gap-1.5 transition"
              >
                <Paperclip className="size-3.5" />
                Open Evidence
              </button>
              <button
                type="button"
                onClick={() => {
                  onOpenChange(false);
                  onContinue();
                }}
                className="h-8 px-3 rounded-md bg-[var(--ds-ink)] text-white text-[12px] font-semibold hover:opacity-90 inline-flex items-center gap-1.5 transition"
              >
                Continue to Review
                <ArrowRight className="size-3.5" />
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function UnusedBody({
  reason,
}: {
  reason: Extract<EvidenceHandoffReason, { kind: "unused" }>;
}) {
  const { total, usedCount, unusedFilenames } = reason;
  const unusedCount = total - usedCount;
  return (
    <>
      <p className="m-0">
        You have <strong>{total}</strong>{" "}
        {total === 1 ? "evidence item" : "evidence items"}.{" "}
        <strong>{usedCount}</strong>{" "}
        {usedCount === 1 ? "is referenced" : "are referenced"}.{" "}
        <strong>{unusedCount}</strong>{" "}
        {unusedCount === 1 ? "is unused" : "are unused"} — these won&rsquo;t be
        cited anywhere in the letter:
      </p>
      <ul className="m-0 mt-2 pl-4 list-disc text-[12.5px] text-[var(--ds-muted)] space-y-0.5">
        {unusedFilenames.map((name) => (
          <li key={name}>
            <em>{name}</em>
          </li>
        ))}
        {unusedCount > unusedFilenames.length && (
          <li>and {unusedCount - unusedFilenames.length} more…</li>
        )}
      </ul>
    </>
  );
}

function HeavyLowCountBody({
  reason,
}: {
  reason: Extract<EvidenceHandoffReason, { kind: "heavy-low-count" }>;
}) {
  const { count } = reason;
  return (
    <p className="m-0">
      This letter type relies heavily on supporting evidence, but you only have{" "}
      <strong>{count === 0 ? "no items" : `${count} item${count === 1 ? "" : "s"}`}</strong>{" "}
      attached. Reviewers expect at least two — usually the chronology plus
      one or two specific incidents. Consider adding more before exporting.
    </p>
  );
}
