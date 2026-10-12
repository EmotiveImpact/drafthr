import type { ComponentProps } from "react";
import { X } from "lucide-react";
import type { Draft } from "@/lib/letters/types";
import { cn } from "@/lib/utils";
import { AIPanel } from "./AIPanel";
import { EditsTab, type EditsFilter } from "./EditsTab";
import { ProgressTab } from "./ProgressTab";

export type SidePanelTab = "edits" | "progress" | "chat";

/**
 * Right side panel of the letter workspace (14B): Edits, Progress and Chat
 * tabs over one AI conversation. The AIPanel stays mounted on every tab so
 * its 3A composer is pinned to the bottom of the panel and the thread keeps
 * its state; the Edits and Progress tabs replace the thread above it.
 * Sending a message switches to Chat.
 */
export function LetterSidePanel({
  draft,
  tab,
  onTabChange,
  activeSectionId,
  editsFilter,
  onEditsFilterChange,
  canResolve,
  pendingEdits,
  onAcceptAll,
  onRejectAll,
  onJumpToSection,
  progress,
  onOpenEvidence,
  onClose,
  closeLabel = "Hide side panel",
}: {
  draft: Draft;
  tab: SidePanelTab;
  onTabChange: (t: SidePanelTab) => void;
  activeSectionId: string | null;
  editsFilter: EditsFilter;
  onEditsFilterChange: (f: EditsFilter) => void;
  canResolve: boolean;
  pendingEdits: number;
  onAcceptAll: () => void;
  onRejectAll: () => void;
  onJumpToSection: (sectionId: string) => void;
  progress: Omit<ComponentProps<typeof ProgressTab>, "draft" | "pendingEdits" | "onOpenEdits">;
  onOpenEvidence: () => void;
  onClose?: () => void;
  closeLabel?: string;
}) {
  const replaceThread =
    tab === "edits" ? (
      <EditsTab
        draft={draft}
        canResolve={canResolve}
        filter={editsFilter}
        onFilterChange={onEditsFilterChange}
        onAcceptAll={onAcceptAll}
        onRejectAll={onRejectAll}
        onJumpToSection={onJumpToSection}
      />
    ) : tab === "progress" ? (
      <ProgressTab
        draft={draft}
        pendingEdits={pendingEdits}
        onOpenEdits={() => {
          onEditsFilterChange("edits");
          onTabChange("edits");
        }}
        {...progress}
      />
    ) : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--ds-surface)]">
      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-[var(--ds-line)] px-3" role="tablist" aria-label="Side panel">
        {(
          [
            ["edits", "Edits", pendingEdits],
            ["progress", "Progress", undefined],
            ["chat", "Chat", undefined],
          ] as const
        ).map(([id, label, count]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => onTabChange(id)}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-[var(--ds-r-s)] px-2.5 text-[13.5px] transition-colors",
              tab === id
                ? "bg-[var(--ds-surface-2)] font-medium text-[var(--ds-ink)]"
                : "text-[var(--ds-body)] hover:text-[var(--ds-ink)]",
            )}
          >
            {label}
            {count !== undefined && count > 0 && (
              <span className="ds-mono text-[11.5px] font-normal text-[var(--ds-muted)]">{count}</span>
            )}
          </button>
        ))}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="ml-auto grid size-8 place-items-center rounded-[var(--ds-r-s)] text-[var(--ds-muted)] transition hover:bg-[var(--ds-surface-2)] hover:text-[var(--ds-ink)]"
            aria-label={closeLabel}
            title={closeLabel}
          >
            <X className="size-4" />
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1">
        <AIPanel
          draft={draft}
          activeSectionId={activeSectionId}
          variant="panel"
          replaceThread={replaceThread}
          threadKey={tab}
          onSent={() => onTabChange("chat")}
          onOpenEvidence={onOpenEvidence}
        />
      </div>
    </div>
  );
}
