import { useState } from "react";
import type { Draft } from "@/lib/letters/types";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { WizardChrome } from "@/components/editor/WizardChrome";
import { sidebarLabelFor } from "@/components/editor/SectionsList";

/**
 * Shared inner contents for the left rail across all three wizard pages
 * (Edit / Evidence / Review). Renders WizardChrome at the top, then —
 * if a `rights` slot is provided — a Sections / Rights tab switcher,
 * then the active tab's content.
 *
 * Renders flat (no <aside> wrapper) — each page mounts it inside its
 * own <aside> so per-page layout concerns (Editor's mobile drawer,
 * Evidence's hidden-below-lg, Review's desktop-only) stay local.
 *
 * Tab logic:
 *   - When `rights` is not passed (Evidence / Review): no tab bar,
 *     section list takes the full rail (current behaviour).
 *   - When `rights` IS passed (Edit): tab bar renders just below
 *     WizardChrome with two tabs. Defaults to Sections. Rights tab
 *     surfaces the EmployeeRail / CompliancePanel.
 *
 * Visual rules (consistent across all three):
 *   • Surface: var(--ds-surface)
 *   • Sections header: label + X/Y ready count
 *   • Each row: numbered chip · reduced title · status dot
 *   • Reduced labels via sidebarLabelFor — long template titles
 *     collapse to compact labels that fit the rail.
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
   * Optional Rights / Compliance content. When supplied, a tab bar
   * appears below the wizard chrome with Sections / Rights tabs.
   * On Edit only — Evidence / Review don't pass this.
   */
  rights?: React.ReactNode;
  /** Label for the rights tab. Defaults to "Rights". */
  rightsLabel?: string;
};

export function WizardSidebar({
  draft,
  current,
  activeSectionId,
  onSelectSection,
  disabled,
  rights,
  rightsLabel = "Rights",
}: Props) {
  const total = draft.sections.length;
  const ready = draft.sections.filter((s) => s.status === "ready").length;

  type Tab = "sections" | "rights";
  const [tab, setTab] = useState<Tab>("sections");
  const showTabs = Boolean(rights);
  const activeTab: Tab = showTabs ? tab : "sections";

  return (
    <>
      <WizardChrome
        draftId={draft.id}
        mode={draft.mode}
        current={current}
        disabled={disabled}
      />

      {showTabs && (
        <div
          className="flex items-stretch border-b border-[var(--ds-line)] shrink-0"
          role="tablist"
          aria-label="Left rail"
        >
          <TabButton
            active={activeTab === "sections"}
            onClick={() => setTab("sections")}
            label="Sections"
            badge={`${ready}/${total}`}
          />
          <TabButton
            active={activeTab === "rights"}
            onClick={() => setTab("rights")}
            label={rightsLabel}
          />
        </div>
      )}

      {activeTab === "sections" ? (
        <>
          {/* When tabs are hidden the X/Y ready count lives inside the
           * Sections header row. With tabs it moves to the tab badge
           * so the header isn't duplicating it. */}
          {!showTabs && (
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
          )}

          <ScrollArea className="flex-1 min-h-0">
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
                          s.status === "streaming" &&
                            "bg-[var(--ds-ink)] animate-pulse",
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
        </>
      ) : (
        // Rights tab — full rail height. The mounted panel
        // (EmployeeRail / CompliancePanel) owns its own ScrollArea, so
        // we just provide the flex slot here. Nesting overflow-auto
        // around the inner ScrollArea caused content to "bleed" past
        // the rail on long lint hits.
        <div className="flex-1 min-h-0 flex flex-col">{rights}</div>
      )}
    </>
  );
}

function TabButton({
  active,
  onClick,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  badge?: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex-1 flex items-center justify-center gap-1.5 h-9 text-[12px] font-medium border-b-2 -mb-px transition",
        active
          ? "border-[var(--ds-ink)] text-[var(--ds-ink)] bg-[var(--ds-surface)]"
          : "border-transparent text-[var(--ds-muted)] hover:text-[var(--ds-ink)] hover:bg-[var(--ds-line-2)]"
      )}
    >
      <span>{label}</span>
      {badge && (
        <span className="text-[10px] text-[var(--ds-muted)] tabular-nums">
          {badge}
        </span>
      )}
    </button>
  );
}
