import type { Draft } from "@/lib/letters/types";
import { AIPanel } from "./AIPanel";

// Change A: right rail is AI-only. Comments now live in a floating
// thread panel anchored to inline highlights; Timeline lives in the
// ⋯ overflow menu as a dialog; Compliance / Rights already lives at the
// bottom of the LEFT rail. The right rail's job is the AI assistant,
// full-stop. No tabs, no competing surfaces.
//
// Tab API kept for callers that still pass `tab` / `onTabChange` so we
// don't ripple the change through the entire editor codebase — those
// props are ignored under Change A.
export type RightRailTab = "ai" | "comments" | "timeline";

export type PendingComment = {
  sectionId: string;
  quote?: string;
  applyMark?: (commentId: string) => void;
};

export function RightRail({
  draft,
  activeSectionId,
}: {
  draft: Draft;
  /** Legacy — accepted but ignored under Change A. */
  tab?: RightRailTab;
  onTabChange?: (t: RightRailTab) => void;
  pendingComment?: PendingComment | null;
  onPendingCommentConsumed?: () => void;
  activeSectionId?: string | null;
}) {
  return (
    <div className="flex flex-col h-full min-h-0">
      <AIPanel draft={draft} activeSectionId={activeSectionId ?? null} />
    </div>
  );
}
