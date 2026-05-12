import type { Draft } from "@/lib/letters/types";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { WizardChrome } from "@/components/editor/WizardChrome";
import { sidebarLabelFor } from "@/components/editor/SectionsList";

/**
 * Shared inner contents for the left rail across all three wizard pages
 * (Edit / Evidence / Review). Renders WizardChrome at the top, then a
 * "Sections — X/Y ready" header, then the section list.
 *
 * Renders flat (no <aside> wrapper) — each page mounts it inside its
 * own <aside> so per-page layout concerns (Editor's mobile drawer,
 * Evidence's hidden-below-lg behaviour, Review's simple desktop-only
 * rail) stay local to each page.
 *
 * Visual rules (consistent across all three):
 *   • Surface: var(--ds-surface) (brighter — matches Evidence)
 *   • Header row: "Sections" label + "X / Y ready" count (from Editor)
 *   • Each row: numbered chip · reduced title · status dot on the right
 *
 * Section titles are reduced via `sidebarLabelFor` so longer template
 * titles ("Statement that this is a protected disclosure") collapse to
 * compact labels ("Statement", "Disclosure", etc). Status dots:
 * green = ready, amber = edited, ink-pulse = streaming, line-grey =
 * empty. On Edit, a section with a pending AI change shows a small
 * "+1" pill instead of the dot.
 */
type Props = {
  draft: Draft;
  /** Which wizard step this sidebar is rendered on. */
  current: "edit" | "evidence" | "review";
  /** Currently-active section in the page (highlighted). */
  activeSectionId?: string | null;
  /** Called when a section is clicked. */
  onSelectSection: (sectionId: string) => void;
  /** Disable WizardChrome navigation (e.g. while AI is streaming). */
  disabled?: boolean;
  /**
   * Optional persistent content rendered below the section list. Used on
   * Edit to pin the Rights / Compliance panel to the bottom of the rail
   * so live tribunal-register checks are always visible while writing
   * (no tab-switch needed). The bottom slot has its own border + bg so
   * it reads as a distinct region from the section list above it.
   */
  bottom?: React.ReactNode;
  /** Header label rendered above the bottom slot. */
  bottomLabel?: string;
};

export function WizardSidebar({
  draft,
  current,
  activeSectionId,
  onSelectSection,
  disabled,
  bottom,
  bottomLabel,
}: Props) {
  const total = draft.sections.length;
  const ready = draft.sections.filter((s) => s.status === "ready").length;

  return (
    <>
      <WizardChrome
        draftId={draft.id}
        mode={draft.mode}
        current={current}
        disabled={disabled}
      />

      {/* Sections header — label on the left, X/Y ready count on the right. */}
      <div className="border-b border-[var(--ds-line-2)] px-4 py-3 flex items-center justify-between">
        <h2 className="m-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ds-muted)]">
          Sections
        </h2>
        <span
          className="text-[10px] font-medium text-[var(--ds-muted)] tabular-nums"
          title={`${ready} of ${total} sections marked ready`}
        >
          {ready}/{total}
        </span>
      </div>

      {/* Sections list. When a bottom slot is provided we cap the
       * sections list to half the available rail so the bottom panel
       * is always partly visible without scrolling. Both regions scroll
       * independently inside their own ScrollAreas. */}
      <ScrollArea className={bottom ? "min-h-0 basis-1/2 flex-1" : "flex-1 min-h-0"}>
        <div className="p-3 space-y-0.5">
          {draft.sections.map((s, i) => {
            const isActive = activeSectionId === s.id;
            return (
              <button
                key={s.id}
                type="button"
                title={s.title}
                onClick={() => onSelectSection(s.id)}
                className={cn(
                  "w-full min-w-0 overflow-hidden text-left px-2 py-1.5 rounded-md text-[13px] flex items-center gap-2 transition-colors",
                  isActive
                    ? "bg-[var(--ds-line-2)] text-[var(--ds-ink)] font-medium"
                    : "text-[var(--ds-body)] hover:bg-[var(--ds-line-2)]"
                )}
              >
                <span className="inline-grid place-items-center size-5 rounded-md bg-[var(--ds-line-2)] text-[10px] font-medium text-[var(--ds-muted)] shrink-0">
                  {i + 1}
                </span>
                <span className="flex-1 min-w-0 truncate">
                  {sidebarLabelFor(s)}
                </span>
                {/* Only show the pending-AI pill on the Edit step — on
                 * Evidence/Review there's nothing the user can do about
                 * a pending change from here. */}
                {current === "edit" && s.pendingChange ? (
                  <span
                    className="shrink-0 px-1 py-px text-[9px] font-bold rounded-full bg-[var(--ds-amber-fg)] text-white"
                    title="AI proposed a change — open this section to review"
                  >
                    +1
                  </span>
                ) : (
                  <span
                    className={cn(
                      "size-1.5 rounded-full shrink-0",
                      s.status === "ready" && "bg-[var(--ds-green-fg)]",
                      s.status === "edited" && "bg-[var(--ds-amber-fg)]",
                      s.status === "streaming" && "bg-[var(--ds-ink)] animate-pulse",
                      s.status === "empty" && "bg-[var(--ds-line)]"
                    )}
                    aria-hidden
                  />
                )}
              </button>
            );
          })}
        </div>
      </ScrollArea>

      {/* Bottom slot — Rights / Compliance panel on Edit. Borders top so
       * the boundary with the section list is unambiguous; own ScrollArea
       * so a long lint list doesn't push the section list out of view. */}
      {bottom && (
        <div className="basis-1/2 flex-1 min-h-0 flex flex-col border-t border-[var(--ds-line)]">
          {bottomLabel && (
            <div className="border-b border-[var(--ds-line-2)] px-4 py-3">
              <h2 className="m-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ds-muted)]">
                {bottomLabel}
              </h2>
            </div>
          )}
          <div className="flex-1 min-h-0 overflow-auto">{bottom}</div>
        </div>
      )}
    </>
  );
}
