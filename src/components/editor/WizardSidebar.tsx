import { useEffect, useState } from "react";
import type { Draft } from "@/lib/letters/types";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { WizardChrome } from "@/components/editor/WizardChrome";
import { sidebarLabelFor } from "@/components/editor/SectionsList";
import { hasText } from "@/lib/journey/stage";

/**
 * Shared inner contents for the left rail across all three wizard pages
 * (Edit / Evidence / Review). Renders WizardChrome at the top, then —
 * if a `secondaryTab` slot is provided — a Sections / [Secondary] tab
 * switcher, then the active tab's content.
 *
 * Renders flat (no <aside> wrapper) — each page mounts it inside its
 * own <aside> so per-page layout concerns (Editor's mobile drawer,
 * Evidence's hidden-below-lg, Review's desktop-only) stay local.
 *
 * Tab logic:
 *   - When `secondaryTab` is not passed (Review): no tab bar, section
 *     list takes the full rail.
 *   - When `secondaryTab` IS passed (Edit, Evidence): tab bar renders
 *     just below WizardChrome with Sections + the second tab. Defaults
 *     to Sections.
 *
 * Visual rules (consistent across all three):
 *   • Surface: var(--ds-surface)
 *   • Sections header: label + X/Y ready count (or in the tab badge
 *     when tabs are shown)
 *   • Each row: numbered chip · reduced title · status dot
 *   • Reduced labels via sidebarLabelFor — long template titles
 *     collapse to compact labels that fit the rail.
 */
type Props = {
  draft: Draft;
  /** Which wizard step this sidebar is rendered on. */
  current: "edit" | "evidence" | "review" | "finalize";
  /** Currently-active section in the page (highlighted). */
  activeSectionId?: string | null;
  /** Called when a section is clicked. */
  onSelectSection: (sectionId: string) => void;
  /** Disable WizardChrome navigation (e.g. while AI is streaming). */
  disabled?: boolean;
  /**
   * Optional secondary content rendered as the second tab in the left
   * rail. When supplied, the rail shows a Sections / [Secondary] tab
   * switcher just below the wizard chrome.
   *
   *   Edit:     <EmployeeRail> / <CompliancePanel>  (label "Rights" / "Compliance")
   *   Evidence: <EvidenceRequirementsList>          (label "Required")
   *   Review:   no secondary tab — the right rail owns the audit surface
   *
   * The mounted panel is expected to own its own scroll container.
   */
  secondaryTab?: React.ReactNode;
  /** Tab button label. */
  secondaryTabLabel?: string;
  /** Optional badge shown on the tab (e.g. "5/8" or "2 issues"). */
  secondaryTabBadge?: string;
  /** Show the old Edit / Review / Finalise steps at the top. The letter
   *  workspace's outline leaves them out: the Progress panel owns the steps. */
  chrome?: boolean;
};

export function WizardSidebar({
  draft,
  current,
  activeSectionId,
  onSelectSection,
  disabled,
  secondaryTab,
  secondaryTabLabel = "More",
  secondaryTabBadge,
  chrome = true,
}: Props) {
  const total = draft.sections.length;
  // Sections with words in them, counted as the Progress panel counts them.
  const ready = draft.sections.filter((s) => hasText(s.html)).length;

  type Tab = "sections" | "secondary";
  const [tab, setTab] = useState<Tab>("sections");
  const showTabs = Boolean(secondaryTab);
  const activeTab: Tab = showTabs ? tab : "sections";

  // If the page swaps from "has secondary" to "no secondary", make sure
  // we don't strand the user on a tab that no longer exists.
  useEffect(() => {
    if (!showTabs && tab !== "sections") setTab("sections");
  }, [showTabs, tab]);

  return (
    <>
      {chrome && (
        <WizardChrome
          draftId={draft.id}
          mode={draft.mode}
          current={current}
          disabled={disabled}
        />
      )}

      {showTabs && (
        <div className="shrink-0 border-b border-[var(--ds-line-2)] px-3 py-2.5">
          <div
            className="flex items-stretch gap-0.5 rounded-[var(--ds-r-m)] bg-[var(--ds-chip)] p-[3px]"
            role="tablist"
            aria-label="Left rail"
          >
            <TabButton
              active={activeTab === "sections"}
              onClick={() => setTab("sections")}
              label="Sections"
              badge={`${ready}/${total}`}
              badgeTitle={`${ready} of ${total} sections drafted`}
            />
            <TabButton
              active={activeTab === "secondary"}
              onClick={() => setTab("secondary")}
              label={secondaryTabLabel}
              badge={secondaryTabBadge}
            />
          </div>
        </div>
      )}

      {activeTab === "sections" ? (
        <>
          {/* When tabs are hidden the X/Y ready count lives inside the
           * Sections header row. With tabs it moves to the tab badge
           * so the header isn't duplicating it. */}
          {!showTabs && (
            <div className="flex items-center justify-between border-b border-[var(--ds-line-2)] px-4 py-3">
              <h2 className="m-0 text-[12.5px] font-medium text-[var(--ds-muted)]">Sections</h2>
              <span
                className="ds-mono text-[11.5px] text-[var(--ds-muted)]"
                title={`${ready} of ${total} sections drafted`}
              >
                {ready}/{total}
              </span>
            </div>
          )}

          <ScrollArea className="flex-1 min-h-0">
            <SectionList
              draft={draft}
              current={current}
              activeSectionId={activeSectionId}
              onSelectSection={onSelectSection}
            />
          </ScrollArea>
        </>
      ) : (
        // Secondary tab — full rail height. The mounted panel
        // (EmployeeRail / CompliancePanel / EvidenceRequirementsList)
        // owns its own scroll container.
        <div className="flex-1 min-h-0 flex flex-col">{secondaryTab}</div>
      )}
    </>
  );
}

/**
 * The list of letter sections: number, compact label, status dot (or a
 * "+1" when DraftHR has proposed a change in Edit). Used by the rail above
 * and by the Evidence page's side panel.
 */
export function SectionList({
  draft,
  current,
  activeSectionId,
  onSelectSection,
}: {
  draft: Draft;
  current: "edit" | "evidence" | "review" | "finalize";
  activeSectionId?: string | null;
  onSelectSection: (sectionId: string) => void;
}) {
  return (
    <div className="space-y-0.5 p-3">
      {draft.sections.map((s, i) => {
        const isActive = activeSectionId === s.id;
        return (
          <button
            key={s.id}
            type="button"
            title={s.title}
            onClick={() => onSelectSection(s.id)}
            className={cn(
              "flex w-full min-w-0 items-center gap-2.5 overflow-hidden rounded-[var(--ds-r-s)] px-2 py-1.5 text-left text-[13px] transition-colors",
              isActive
                ? "bg-[var(--ds-surface-2)] font-medium text-[var(--ds-ink)]"
                : "text-[var(--ds-body)] hover:bg-[var(--ds-surface-2)]"
            )}
          >
            <span className="ds-mono w-4 shrink-0 text-right text-[11px] text-[var(--ds-faint)]">
              {i + 1}
            </span>
            <span className="min-w-0 flex-1 truncate">{sidebarLabelFor(s)}</span>
            {current === "edit" && s.pendingChange ? (
              <span
                className="shrink-0 rounded-[var(--ds-r-s)] bg-[var(--ds-violet-bg)] px-1.5 py-px text-[10.5px] font-medium text-[var(--ds-violet-fg)]"
                title="DraftHR proposed a change. Open this section to review it."
              >
                +1
              </span>
            ) : (
              <span
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  s.status === "ready" && "bg-[var(--ds-green-fg)]",
                  s.status === "edited" && "bg-[var(--ds-amber-dot)]",
                  s.status === "streaming" && "animate-pulse bg-[var(--ds-ink)]",
                  s.status === "empty" && "bg-[var(--ds-line-strong)]"
                )}
                aria-hidden
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
  badge,
  badgeTitle,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  badge?: string;
  badgeTitle?: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex h-[26px] flex-1 items-center justify-center gap-1.5 rounded-[7px] text-[12.5px] font-medium transition",
        active
          ? "bg-[var(--ds-surface)] text-[var(--ds-ink)] shadow-[var(--ds-shadow-s),0_0_0_1px_var(--ds-line)]"
          : "text-[var(--ds-muted)] hover:text-[var(--ds-ink)]"
      )}
    >
      <span>{label}</span>
      {badge && (
        <span className="ds-mono text-[11px] text-[var(--ds-muted)]" title={badgeTitle}>
          {badge}
        </span>
      )}
    </button>
  );
}
