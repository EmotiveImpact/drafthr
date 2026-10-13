import { History } from "lucide-react";
import type { Draft, Section } from "@/lib/letters/types";
import { REVIEW_VERDICT_LABELS, type ReviewRequest } from "@/lib/journey/reviews";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { TimelinePanel } from "./TimelinePanel";
import { fmtWhen } from "./letter-facts";

export type ActivityTab = "history" | "versions" | "rounds";

/**
 * Activity (document bar): the letter's history. The timeline of changes,
 * comments, exports, reviews and approvals (newest first), each section's
 * saved versions with Restore, and the review rounds when the letter has
 * been reviewed.
 */
export function ActivityDialog({
  open,
  onOpenChange,
  draft,
  review,
  tab,
  onTabChange,
  onShowSectionHistory,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: Draft;
  review: ReviewRequest | null;
  tab: ActivityTab;
  onTabChange: (tab: ActivityTab) => void;
  onShowSectionHistory: (section: Section) => void;
}) {
  const rounds = review && review.status !== "recalled" ? review.rounds : [];
  const tabs: { id: ActivityTab; label: string }[] = [
    { id: "history", label: "History" },
    { id: "versions", label: "Versions" },
    ...(rounds.length > 0 ? [{ id: "rounds" as const, label: "Review rounds" }] : []),
  ];
  const current = tabs.some((t) => t.id === tab) ? tab : "history";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-[600px]">
        <div className="px-6 pb-3 pt-5 pr-14">
          <DialogTitle className="flex items-center gap-2 text-[22px]">
            <History aria-hidden className="size-[18px] text-[var(--ds-muted)]" /> Activity
          </DialogTitle>
          <DialogDescription className="mt-1 text-[13.5px]">
            Everything that has happened to this letter, newest first, and the saved versions of each section.
          </DialogDescription>
          <div className="mt-3 inline-flex rounded-[9px] bg-[var(--ds-surface-2)] p-[3px]" role="tablist" aria-label="Activity">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={current === t.id}
                onClick={() => onTabChange(t.id)}
                className={cn(
                  "h-7 rounded-[7px] px-3 text-[13px] transition-colors duration-[120ms] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]",
                  current === t.id
                    ? "bg-[var(--ds-surface)] font-medium text-[var(--ds-ink)] shadow-[var(--ds-shadow-s)]"
                    : "text-[var(--ds-muted)] hover:text-[var(--ds-ink)]"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="min-h-[320px] flex-1 overflow-auto border-t border-[var(--ds-line-2)]">
          {current === "history" && <TimelinePanel draft={draft} />}
          {current === "versions" && (
            <ul className="m-0 list-none p-2">
              {draft.sections.map((s) => {
                const n = s.versions?.length ?? 0;
                const last = n ? s.versions[n - 1] : null;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      disabled={n === 0}
                      onClick={() => onShowSectionHistory(s)}
                      className="flex w-full items-center gap-3 rounded-[9px] px-3 py-2.5 text-left transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] active:bg-[var(--ds-surface-3)] disabled:cursor-default disabled:hover:bg-transparent focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] text-[var(--ds-ink)]">{s.title}</span>
                        <span className="block text-[12.5px] text-[var(--ds-muted)]">
                          {n === 0
                            ? "No saved versions yet"
                            : `${n} saved version${n === 1 ? "" : "s"} · last ${fmtWhen(last!.createdAt)}`}
                        </span>
                      </span>
                      {n > 0 && <span className="shrink-0 text-[12.5px] font-medium text-[var(--ds-ink)]">Versions</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {current === "rounds" && review && (
            <ol className="m-0 list-none p-4">
              {[...rounds].reverse().map((r) => (
                <li key={r.n} className="border-b border-[var(--ds-line-2)] py-3 last:border-b-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[13.5px] font-medium text-[var(--ds-ink)]">Round {r.n}</span>
                    <span className="text-[12.5px] text-[var(--ds-muted)]">
                      Sent {fmtWhen(r.sentAt)}
                      {r.backAt ? ` · back ${fmtWhen(r.backAt)}` : " · still with the reviewer"}
                    </span>
                  </div>
                  <p className="m-0 mt-1 text-[13px] text-[var(--ds-body)]">
                    {review.reviewer.name}
                    {r.verdict ? `: ${REVIEW_VERDICT_LABELS[r.verdict]}` : ""}
                    {r.backAt
                      ? ` · ${r.suggestionIds.length} change${r.suggestionIds.length === 1 ? "" : "s"}, ${r.commentIds.length} comment${r.commentIds.length === 1 ? "" : "s"}`
                      : ""}
                  </p>
                  {r.note && <p className="m-0 mt-1 whitespace-pre-wrap text-[13px] text-[var(--ds-muted)]">{r.note}</p>}
                </li>
              ))}
            </ol>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
