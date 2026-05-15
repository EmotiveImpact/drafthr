import { useState, useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Activity } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { BrandMark } from "@/components/ds";
import { Wordmark } from "@/components/ds/Wordmark";
import { useDraftStore } from "@/lib/store";
import { LetterPreview } from "@/components/editor/LetterPreview";
import { ReviewRail } from "@/components/editor/ReviewRail";
import { Button } from "@/components/ui/button";
import { getLetterMeta } from "@/lib/letters/catalog";
import { WizardSidebar } from "@/components/editor/WizardSidebar";
import { cn } from "@/lib/utils";

/**
 * Review step — the assessment page between Edit and Finalise. 3-column
 * layout matching the rest of the wizard:
 *
 *   [WizardSidebar] [LetterPreview]  [ReviewRail]
 *      sections        clean letter     Health / Improve / Consult
 *
 *   Edit → REVIEW → Finalise (ship gate lives there)
 *
 * The letter is actually visible on Review — the right rail (ReviewRail)
 * handles all the "is this ready?" signals (Health/Improve/Consult tabs)
 * before the user steps into Finalise. Export, counsel-gate, and
 * Mark-as-sent all live on Finalise so the user gets one consolidated
 * ship surface instead of having ship-gate logic scattered across pages.
 * Evidence is a drawer accessible from Edit; it is no longer a wizard step.
 */
export function ReviewStep() {
  const { draftId } = useParams<{ draftId: string }>();
  const nav = useNavigate();
  const draft = useDraftStore((s) => (draftId ? s.drafts[draftId] : undefined));

  if (!draft || !draftId) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12">
        <p className="text-sm text-muted-foreground">Draft not found.</p>
        <Button variant="ghost" className="mt-4" onClick={() => nav("/")}>
          <ArrowLeft className="size-4 mr-1" /> Back home
        </Button>
      </div>
    );
  }

  const meta = getLetterMeta(draft.letterType);

  // Counsel-review status surfaced in ReviewRail. The actual export gate
  // moved to Finalize, but the rail still wants to know whether a review
  // has been attached so it can render the green tick.
  const counselReview: { reviewedBy: string; reviewedOn: string } | null = (() => {
    const last = (draft.exports ?? [])
      .slice()
      .sort((a, b) => b.exportedAt - a.exportedAt)
      .find((e) => e.reviewedBy);
    if (last?.reviewedBy && last.reviewedOn) {
      return { reviewedBy: last.reviewedBy, reviewedOn: last.reviewedOn };
    }
    const manual = (draft.answers as Record<string, unknown>)._counselReview as
      | { reviewedBy?: string; reviewedOn?: string }
      | undefined;
    if (manual?.reviewedBy && manual.reviewedOn) {
      return { reviewedBy: manual.reviewedBy, reviewedOn: manual.reviewedOn };
    }
    return null;
  })();

  const unresolvedCommentCount = (draft.comments ?? []).filter(
    (c) => !c.resolved
  ).length;

  /* ── Health dock state ──────────────────────────────────────────────────
   * Three states: rest (pill), drawer overlay, pinned inline rail.
   * healthPinned is persisted to localStorage so it survives reloads.
   * Using lazy useState init so there's no flash on first render.
   * ---------------------------------------------------------------------- */
  const HEALTH_KEY = (id: string) => `drafthr.healthPinned:${id}`;

  const [healthDrawerOpen, setHealthDrawerOpen] = useState(false);
  const [healthPinned, setHealthPinned] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(HEALTH_KEY(draftId)) === "1";
    } catch {
      return false;
    }
  });

  // Sync pin state to localStorage whenever it changes.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (healthPinned) {
        window.localStorage.setItem(HEALTH_KEY(draftId), "1");
      } else {
        window.localStorage.removeItem(HEALTH_KEY(draftId));
      }
    } catch { /* ignore — storage may be unavailable */ }
  }, [healthPinned, draftId]);

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-[var(--ds-canvas)]">
      {/* Breadcrumb header. Back-link points to Edit now that Evidence
       * has left the wizard (it's a drawer in Edit). */}
      <header className="h-14 shrink-0 border-b border-[var(--ds-line)] bg-[var(--ds-surface)] sticky top-0 z-30 flex items-center px-4 gap-2">
        <Link
          to="/"
          aria-label="Home"
          className="shrink-0 flex items-center gap-2 rounded-md hover:bg-[var(--ds-line-2)] transition px-1.5 py-1 -mx-1.5 h-10 mr-2"
        >
          <BrandMark size={36} />
          <Wordmark size={16} className="hidden sm:inline" />
        </Link>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => nav(`/editor/${draft.id}`)}
          className="text-[12px]"
        >
          <ArrowLeft className="size-3.5 mr-1.5" />
          Edit
        </Button>
        <span className="text-[var(--ds-subtle)]">/</span>
        <span className="text-[13px] font-medium text-[var(--ds-ink)]">Review</span>
        <span className="text-[12px] text-[var(--ds-muted)] hidden md:inline">
          · {meta.title}
        </span>
        {/* Right cluster: Back (paired action) + Finalise forward action.
         * The left ghost "Edit" link acts as a breadcrumb; Back here is
         * the action-pair for Finalise so the user can navigate either way
         * without hunting across the header. */}
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => nav(`/editor/${draft.id}`)}
          >
            <ArrowLeft className="size-3.5 mr-1.5" />
            Back
          </Button>
          <Button
            size="sm"
            onClick={() => nav(`/editor/${draft.id}/finalize`)}
          >
            Finalise
            <ArrowRight className="size-4 ml-1.5" />
          </Button>
        </div>
      </header>

      {/* Layout — 2-column when health is unpinned; 3-column when pinned.
       *   [WizardSidebar 260px] [letter preview canvas] [ReviewRail 360px?]
       * Single visual rhythm across the whole wizard. The letter is now
       * actually visible on Review — previously it was buried behind
       * the checklist. */}
      <div
        className={cn(
          "grid min-h-0 flex-1 grid-cols-1",
          healthPinned
            ? "lg:grid-cols-[260px_minmax(0,1fr)_360px]"
            : "lg:grid-cols-[260px_minmax(0,1fr)]",
        )}
      >
        <aside className="hidden min-h-0 border-r border-[var(--ds-line)] bg-[var(--ds-surface)] lg:flex lg:flex-col">
          <WizardSidebar
            draft={draft}
            current="review"
            onSelectSection={(id) => nav(`/editor/${draft.id}?section=${id}`)}
          />
        </aside>

        <main className="min-h-0 overflow-y-auto bg-[var(--ds-canvas)] p-4 sm:p-6">
          <LetterPreview draft={draft} />
        </main>

        {/* Pinned inline rail — only mounted when healthPinned. */}
        {healthPinned && (
          <aside className="hidden min-h-0 border-l border-[var(--ds-line)] bg-[var(--ds-surface)] lg:flex lg:flex-col">
            <ReviewRail
              draft={draft}
              counselReviewedBy={counselReview}
              unresolvedComments={unresolvedCommentCount}
              onJumpToSection={(sectionId) =>
                nav(`/editor/${draft.id}?section=${sectionId}`)
              }
              onJumpToEvidence={() => nav(`/editor/${draft.id}/evidence`)}
              onContinueToFinalize={() => nav(`/editor/${draft.id}/finalize`)}
              isPinned
              onUnpin={() => setHealthPinned(false)}
            />
          </aside>
        )}
      </div>

      {/* ── Health drawer overlay ────────────────────────────────────────────
       * Slides in from the right when the Health pill is clicked and the
       * rail is not pinned. Same pattern as the AI / Evidence drawers in
       * Editor.tsx. Scrim click closes the drawer. */}
      <button
        type="button"
        className={cn(
          "fixed inset-0 z-30 bg-black/30 transition-opacity duration-200 motion-reduce:transition-none",
          healthDrawerOpen && !healthPinned
            ? "opacity-100"
            : "opacity-0 pointer-events-none",
        )}
        aria-label="Close Health drawer"
        aria-hidden={!healthDrawerOpen || undefined}
        onClick={() => setHealthDrawerOpen(false)}
      />
      <AnimatePresence>
        {healthDrawerOpen && !healthPinned && (
          <motion.aside
            key="health-drawer-overlay"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 340, damping: 42, mass: 0.9 }}
            className="fixed inset-y-0 right-0 z-40 w-full max-w-[420px] bg-[var(--ds-surface)] border-l border-[var(--ds-line)] shadow-2xl flex flex-col min-h-0 overflow-hidden"
          >
            <ReviewRail
              draft={draft}
              counselReviewedBy={counselReview}
              unresolvedComments={unresolvedCommentCount}
              onJumpToSection={(sectionId) =>
                nav(`/editor/${draft.id}?section=${sectionId}`)
              }
              onJumpToEvidence={() => nav(`/editor/${draft.id}/evidence`)}
              onContinueToFinalize={() => nav(`/editor/${draft.id}/finalize`)}
              isPinned={false}
              onPin={() => {
                setHealthPinned(true);
                setHealthDrawerOpen(false);
              }}
              onClose={() => setHealthDrawerOpen(false)}
            />
          </motion.aside>
        )}
      </AnimatePresence>

      {/* ── Health pill ─────────────────────────────────────────────────────
       * Bottom-right fixed pill. Hidden when the rail is pinned inline.
       * Desktop-only (hidden on mobile where the rail isn't shown either). */}
      {!healthPinned && (
        <button
          type="button"
          onClick={() => setHealthDrawerOpen(true)}
          className="hidden lg:inline-flex fixed bottom-4 right-4 z-30 items-center gap-1.5 h-9 pl-2 pr-3 rounded-full bg-[var(--ds-surface)] border border-[var(--ds-line)] shadow-[0_6px_18px_rgba(0,0,0,0.10)] hover:opacity-95 transition"
          aria-label="Open Health rail"
        >
          <span className="grid place-items-center size-5 rounded-full bg-[var(--ds-line-2)]">
            <Activity className="size-3 text-[var(--ds-ink)]" />
          </span>
          <span className="text-[12px] font-semibold text-[var(--ds-ink)]">Health</span>
        </button>
      )}

    </div>
  );
}
