import { useState } from "react";
import { ShieldCheck, Scale, MessageSquare, Wand2 } from "lucide-react";
import type { Draft } from "@/lib/letters/types";
import { CompliancePanel } from "./CompliancePanel";
import { EmployeeRail } from "./EmployeeRail";
import { CommentsPanel } from "./CommentsPanel";
import { AIPanel } from "./AIPanel";

export type RightRailTab = "compliance" | "ai" | "comments";

type Tab = RightRailTab;

/**
 * Right-rail container with a tab switcher between the existing
 * compliance/rights panel and the new Collaborators panel. Mode-aware:
 * employer drafts surface CompliancePanel; employee drafts surface
 * EmployeeRail. The Collaborators tab is shared.
 */
export type PendingComment = {
  sectionId: string;
  quote?: string;
  applyMark?: (commentId: string) => void;
};

export function RightRail({
  draft,
  tab: controlledTab,
  onTabChange,
  pendingComment,
  onPendingCommentConsumed,
  activeSectionId,
}: {
  draft: Draft;
  tab?: Tab;
  onTabChange?: (t: Tab) => void;
  pendingComment?: PendingComment | null;
  onPendingCommentConsumed?: () => void;
  activeSectionId?: string | null;
}) {
  const [internalTab, setInternalTab] = useState<Tab>("ai");
  const tab = controlledTab ?? internalTab;
  const setTab = (t: Tab) => {
    if (onTabChange) onTabChange(t);
    else setInternalTab(t);
  };
  const unresolvedCommentsCount = (draft.comments ?? []).filter((c) => !c.resolved).length;
  const aiMessageCount = (draft.aiChat ?? []).length;
  const isEmployee = draft.mode === "employee";
  const ComplianceIcon = isEmployee ? Scale : ShieldCheck;
  const complianceLabel = isEmployee ? "Rights" : "Compliance";

  return (
    <div className="flex flex-col h-full min-h-0">
      <div
        className="flex items-stretch border-b border-[var(--ds-line)] shrink-0"
        role="tablist"
        aria-label="Right rail"
      >
        <RailTab
          active={tab === "ai"}
          onClick={() => setTab("ai")}
          icon={<Wand2 className="size-3.5" />}
          label="AI"
          badge={aiMessageCount > 0 ? aiMessageCount : undefined}
        />
        <RailTab
          active={tab === "comments"}
          onClick={() => setTab("comments")}
          icon={<MessageSquare className="size-3.5" />}
          label="Comments"
          badge={unresolvedCommentsCount > 0 ? unresolvedCommentsCount : undefined}
        />
        <RailTab
          active={tab === "compliance"}
          onClick={() => setTab("compliance")}
          icon={<ComplianceIcon className="size-3.5" />}
          label={complianceLabel}
        />
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === "ai" && <AIPanel draft={draft} activeSectionId={activeSectionId ?? null} />}
        {tab === "comments" && (
          <CommentsPanel
            draft={draft}
            pendingComment={pendingComment ?? null}
            onPendingCommentConsumed={onPendingCommentConsumed}
          />
        )}
        {tab === "compliance" && (isEmployee ? <EmployeeRail draft={draft} /> : <CompliancePanel draft={draft} />)}
      </div>
    </div>
  );
}

function RailTab({
  active,
  onClick,
  icon,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: number;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={
        "flex-1 flex items-center justify-center gap-1.5 h-9 text-xs font-medium transition-colors " +
        (active
          ? "bg-background text-foreground border-b-2 border-foreground -mb-[1px]"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/40")
      }
    >
      {icon}
      <span>{label}</span>
      {typeof badge === "number" && (
        <span className="ml-0.5 inline-flex items-center justify-center size-4 text-[10px] rounded-full bg-[var(--accent-9)] text-[var(--accent-contrast)]">
          {badge}
        </span>
      )}
    </button>
  );
}
