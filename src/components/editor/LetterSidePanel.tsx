import { useLayoutEffect, useRef, useState, type ComponentProps } from "react";
import { PanelRight } from "lucide-react";
import type { Draft } from "@/lib/letters/types";
import type { JourneyStage } from "@/lib/journey/stage";
import { cn } from "@/lib/utils";
import { AIPanel } from "./AIPanel";
import { EditsTab, type EditsFilter } from "./EditsTab";
import { ProgressTab } from "./ProgressTab";
import { appealWorkingDays } from "@/components/journey/send/record";

export type SidePanelTab = "edits" | "progress" | "chat";

const TRIBUNAL =
  "Rewrite this letter to be tribunal-ready: strictly factual, no intensifiers, no admissions, reservation of rights at the close, statutory anchors explicit. Walk through each section that needs changing.";
const FIRMER =
  "Make the tone of this letter firmer without becoming aggressive. Keep every fact, date and required clause, and propose each change as a suggested edit.";
const COUNSEL =
  "Summarise this letter for an external employment-law adviser. Cover (1) what the letter says, (2) what it relies on, (3) what it asks for, (4) key risk points.";

/** Prompt chips over the Ask DraftHR box, by stage (mocks f1 to f8). */
function chipsFor(stage: JourneyStage, reviewBack: boolean, draft: Draft): { label: string; prompt: string }[] {
  switch (stage) {
    case "draft":
      return [
        { label: "Tribunal-ready", prompt: TRIBUNAL },
        { label: "Firmer", prompt: FIRMER },
        { label: "Summarise for counsel", prompt: COUNSEL },
      ];
    case "review":
      return reviewBack
        ? [
            { label: "Explain the changes", prompt: "Explain the reviewer's suggested changes in plain words, one by one, and say which matter most legally." },
            { label: "Summarise for counsel", prompt: COUNSEL },
          ]
        : [{ label: "Summarise for counsel", prompt: COUNSEL }];
    case "approve":
      return [
        {
          label: "Summarise for the approver",
          prompt:
            "Summarise this letter for the person approving it: what it decides, what it relies on, and anything they should check before they approve. Do not change the letter.",
        },
        { label: "Summarise for counsel", prompt: COUNSEL },
      ];
    case "send":
      return [
        { label: "Draft a covering email", prompt: "Draft a short, neutral covering email to send with this letter. Do not repeat the letter's content; say it is attached and how to ask questions." },
        { label: "Check before sending", prompt: "Check this letter before it is sent: dates, names, the appeal window and anything that could be challenged. List anything to fix." },
      ];
    case "sent": {
      // Only letters with a right of appeal get the appeal chip (SEND-88).
      const appealable = appealWorkingDays(draft) !== null;
      return [
        {
          label: "Summarise for the file",
          prompt:
            "Summarise this letter for the employee's file in five lines: what was decided, when and how it was given, and any deadlines.",
        },
        ...(appealable
          ? [
              {
                label: "Draft appeal outcome",
                prompt: `Draft an appeal outcome letter ${
                  draft.matterId ? "for this matter" : "following this letter"
                }, ready to complete after the appeal hearing.`,
              },
            ]
          : []),
      ];
    }
    default:
      return [];
  }
}

/**
 * The letter's side panel (mocks f1 to f8): a 60px header with the Edits,
 * Progress and Chat segments and a button that hides the panel; under it
 * the chosen tab above the Ask DraftHR box. One AIPanel stays mounted on
 * every tab so the box and the chat thread keep their state; sending
 * switches to Chat.
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
  progress: Omit<ComponentProps<typeof ProgressTab>, "draft">;
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
      <ProgressTab draft={draft} {...progress} />
    ) : undefined;

  const stage = progress.journey.stage;
  const reviewBack = progress.journey.review?.status === "back";

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--ds-surface)]">
      <div className="flex h-[60px] shrink-0 items-center gap-2 border-b border-[var(--ds-line-2)] pl-4 pr-3">
        <Segmented tab={tab} onTabChange={onTabChange} pendingEdits={pendingEdits} />
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="ml-auto grid size-[34px] shrink-0 place-items-center rounded-[8px] text-[var(--ds-muted)] transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] hover:text-[var(--ds-ink)] active:bg-[var(--ds-surface-3)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
            aria-label={closeLabel}
            title={closeLabel}
          >
            <PanelRight className="size-[18px]" />
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
          chips={chipsFor(stage, reviewBack, draft)}
          locked={progress.journey.locked}
        />
      </div>
    </div>
  );
}

/** Grey segmented control; the white thumb slides to the chosen tab. */
function Segmented({
  tab,
  onTabChange,
  pendingEdits,
}: {
  tab: SidePanelTab;
  onTabChange: (t: SidePanelTab) => void;
  pendingEdits: number;
}) {
  const items: { id: SidePanelTab; label: string; count?: number }[] = [
    { id: "edits", label: "Edits", count: pendingEdits },
    { id: "progress", label: "Progress" },
    { id: "chat", label: "Chat" },
  ];
  const listRef = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const list = listRef.current;
    const el = list?.querySelector<HTMLElement>(`[data-tab="${tab}"]`);
    if (!list || !el) return;
    setThumb({ left: el.offsetLeft, width: el.offsetWidth });
  }, [tab, pendingEdits]);

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label="Side panel"
      className="relative grid h-[34px] min-w-0 flex-1 grid-cols-3 rounded-[10px] bg-[var(--ds-surface-2)] p-[3px]"
    >
      {thumb && (
        <span
          aria-hidden
          className="lw-seg-thumb absolute top-[3px] bottom-[3px] rounded-[8px] bg-[var(--ds-surface)] shadow-[var(--ds-shadow-s)]"
          style={{ transform: `translateX(${thumb.left - 3}px)`, width: thumb.width, left: 3 }}
        />
      )}
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          role="tab"
          data-tab={it.id}
          aria-selected={tab === it.id}
          onClick={() => onTabChange(it.id)}
          className={cn(
            "relative z-[1] inline-flex min-w-0 items-center justify-center gap-1.5 rounded-[8px] text-[14px] transition-colors duration-[120ms] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]",
            tab === it.id ? "font-medium text-[var(--ds-ink)]" : "text-[var(--ds-muted)] hover:text-[var(--ds-ink)]"
          )}
        >
          {it.label}
          {it.count !== undefined && it.count > 0 && (
            // Muted: the count sits on the tab track's fill (AA there).
            <span className="ds-mono text-[12px] font-normal text-[var(--ds-muted)]">{it.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}
