import { useEffect, useMemo, useState } from "react";
import { AlignLeft, CheckCheck, Columns2, MessageSquare, PenLine, Pilcrow } from "lucide-react";
import type { Draft } from "@/lib/letters/types";
import { getDiffViewMode, setDiffViewMode, type DiffViewMode } from "@/lib/diff-view-mode";
import { sanitizeLetterHtml } from "@/lib/sanitize";
import { MarginCard } from "@/components/journey/ui";
import { cn } from "@/lib/utils";
import { CommentsPanel } from "./CommentsPanel";
import { acceptWithSettle, decideEdit, suggestedEdits, type SuggestedEdit } from "./suggestion-groups";

const SOURCE_CATEGORY: Record<string, string> = {
  regenerate: "Rewrite",
  addClause: "Add a clause",
  tighten: "Tighten",
  manual: "Edit",
  review: "Suggested edit",
};

function plainText(html: string): string {
  if (typeof window === "undefined" || !html) return "";
  const el = document.createElement("div");
  el.innerHTML = sanitizeLetterHtml(html);
  return (el.textContent ?? "").replace(/\s+/g, " ").trim();
}

function clip(text: string, max = 220): string {
  return text.length > max ? text.slice(0, max - 1).trimEnd() + "…" : text;
}

type Part = { kind: "del" | "ins"; text: string };

/** The changed runs of one suggested edit, in document order. */
function partsFor(edit: SuggestedEdit): Part[] {
  if (typeof window === "undefined") return [];
  if (edit.ids.length > 0) {
    const root = document.createElement("div");
    root.innerHTML = sanitizeLetterHtml(edit.section.html ?? "");
    const want = new Set(edit.ids);
    return [...root.querySelectorAll("ins[data-suggestion-id], del[data-suggestion-id]")]
      .filter((el) => want.has(el.getAttribute("data-suggestion-id") ?? ""))
      .map((el) => ({
        kind: el.tagName === "DEL" ? ("del" as const) : ("ins" as const),
        text: clip((el.textContent ?? "").trim(), 140),
      }))
      .filter((p) => p.text);
  }
  const p = edit.pending;
  if (!p) return [];
  const before = clip(plainText(p.prevHtml ?? edit.section.html), 160);
  const after = clip(plainText(p.proposedHtml));
  return [
    ...(before ? [{ kind: "del" as const, text: before }] : []),
    ...(after ? [{ kind: "ins" as const, text: after }] : []),
  ];
}

export type EditsFilter = "edits" | "comments";

/**
 * The Edits tab of the letter side panel (f1 "Edits 1"): every suggested
 * edit waiting for a decision as a card (DraftHR in green, a reviewer in
 * lilac) with Accept and Reject, Accept all and Reject all (the workspace
 * shows the undo toast), and the letter's comment threads behind a
 * "Comments" filter. A card jumps to its paragraph when clicked. Decisions
 * go through the same calls as the margin cards, so they are recorded for
 * the Approve step's review summary.
 */
export function EditsTab({
  draft,
  canResolve,
  filter,
  onFilterChange,
  onAcceptAll,
  onRejectAll,
  onJumpToSection,
}: {
  draft: Draft;
  canResolve: boolean;
  filter: EditsFilter;
  onFilterChange: (f: EditsFilter) => void;
  /** Accept every pending edit (with the undo toast the workspace shows). */
  onAcceptAll: () => void;
  onRejectAll: () => void;
  onJumpToSection: (sectionId: string) => void;
}) {
  const [mode, setMode] = useState<DiffViewMode>(() => getDiffViewMode());
  useEffect(() => {
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<DiffViewMode>).detail;
      if (detail === "inline" || detail === "card") setMode(detail);
    };
    window.addEventListener("drafthr:diff-view-mode", onChange);
    return () => window.removeEventListener("drafthr:diff-view-mode", onChange);
  }, []);

  const edits = useMemo(() => suggestedEdits(draft), [draft]);
  const [leaving, setLeaving] = useState<Record<string, boolean>>({});
  const comments = (draft.comments ?? []).filter((c) => !c.parentId && !c.resolved).length;

  let reviewerN = 0;

  return (
    <div className="flex min-w-0 flex-col gap-3 px-4 pb-4 pt-3.5">
      <div className="flex items-center gap-1" role="tablist" aria-label="Show">
        <FilterPill
          active={filter === "edits"}
          onClick={() => onFilterChange("edits")}
          icon={<PenLine className="size-3.5" />}
          label="Edits"
          count={edits.length}
        />
        <FilterPill
          active={filter === "comments"}
          onClick={() => onFilterChange("comments")}
          icon={<MessageSquare className="size-3.5" />}
          label="Comments"
          count={comments}
        />
      </div>

      {filter === "comments" ? (
        <div className="min-w-0">
          <CommentsPanel draft={draft} />
        </div>
      ) : (
        <>
          <div className="flex min-h-7 items-center justify-between gap-2.5">
            <span className="min-w-0 truncate text-[13px] text-[var(--ds-muted)]" aria-live="polite">
              {edits.length > 0 ? (
                <>
                  <b className="font-medium text-[var(--ds-ink)]">{edits.length}</b>{" "}
                  suggested edit{edits.length === 1 ? "" : "s"} to decide
                </>
              ) : (
                "Nothing to decide"
              )}
            </span>
            {edits.length > 0 && canResolve && (
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={onRejectAll}
                  className="inline-flex h-7 items-center rounded-[7px] px-2 text-[12.5px] font-medium text-[var(--ds-muted)] transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] hover:text-[var(--ds-ink)] active:bg-[var(--ds-surface-3)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
                  title="Reject every pending edit"
                >
                  Reject all
                </button>
                <button
                  type="button"
                  onClick={onAcceptAll}
                  className="inline-flex h-7 items-center gap-1.5 rounded-[7px] bg-[var(--ds-accent)] px-2.5 text-[12.5px] font-medium text-[var(--ds-on-accent)] transition-colors duration-[120ms] hover:bg-[var(--ds-accent-hover)] active:bg-[var(--ds-accent-press)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
                  title="Accept every pending edit"
                >
                  <CheckCheck className="size-3.5" />
                  Accept all
                </button>
              </div>
            )}
          </div>

          {edits.length === 0 ? (
            <div className="rounded-[12px] bg-[var(--ds-surface-2)] px-4 py-6 text-center">
              <p className="m-0 text-[13.5px] font-medium text-[var(--ds-ink)]">No edits waiting</p>
              <p className="m-0 mx-auto mt-1 max-w-[30ch] text-[12.5px] leading-relaxed text-[var(--ds-muted)]">
                When DraftHR or a reviewer suggests a change, it appears here for you to accept or reject.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {edits.map((edit, i) => {
                if (!edit.ai) reviewerN += 1;
                const parts = partsFor(edit);
                const key = edit.key;
                const leave = (then: () => void) => {
                  setLeaving((l) => ({ ...l, [key]: true }));
                  window.setTimeout(then, 220);
                };
                const accept = () => leave(() => acceptWithSettle(draft.id, edit));
                const reject = () => leave(() => decideEdit(draft.id, edit, false));
                return (
                  <div
                    key={key}
                    data-leaving={leaving[key] || undefined}
                    className="lw-margin-card cursor-pointer"
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest("button")) return;
                      onJumpToSection(edit.section.id);
                    }}
                  >
                    <MarginCard
                      kind={edit.ai ? "drafthr" : "reviewer"}
                      connector={false}
                      author={edit.ai ? undefined : { name: edit.author || "Reviewer", seed: edit.authorId || edit.author }}
                      meta={edit.ai ? SOURCE_CATEGORY[edit.pending?.source ?? ""] ?? "Rewrite" : `Suggestion ${reviewerN}`}
                      onAccept={canResolve ? accept : undefined}
                      onReject={canResolve ? reject : undefined}
                      count={`${i + 1} of ${edits.length}`}
                      className="w-full shadow-none"
                    >
                      <button
                        type="button"
                        onClick={() => onJumpToSection(edit.section.id)}
                        className="mb-1 inline-flex max-w-full items-center gap-1 rounded-[5px] text-[12px] font-medium text-[var(--ds-muted)] transition-colors duration-[120ms] hover:text-[var(--ds-ink)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
                        title="Show in the letter"
                      >
                        <Pilcrow className="size-3 shrink-0" />
                        <span className="truncate">{edit.section.title}</span>
                      </button>
                      {parts.length > 0 && (
                        <p className="m-0 font-serif text-[13.5px] leading-[1.5] text-[var(--ds-body)] [overflow-wrap:anywhere]">
                          {parts.map((p, j) =>
                            p.kind === "del" ? (
                              <del
                                key={j}
                                className={cn(
                                  "mr-1 rounded-[2px] decoration-1",
                                  edit.ai
                                    ? "bg-[var(--ds-red-soft)] text-[var(--ds-red-fg)] decoration-[var(--ds-red-line)]"
                                    : "bg-[var(--ds-lilac-soft)] text-[var(--ds-lilac-fg)] decoration-[var(--ds-lilac-line)]"
                                )}
                              >
                                {p.text}
                              </del>
                            ) : (
                              <ins
                                key={j}
                                className={cn(
                                  "mr-1 rounded-[2px] border-b-[1.5px] no-underline",
                                  edit.ai
                                    ? "border-[var(--ds-green-line)] bg-[var(--ds-green-bg)] text-[var(--ds-green-ink)]"
                                    : "border-[var(--ds-lilac-ring)] bg-[var(--ds-lilac-bg)] text-[var(--ds-lilac-ink)]"
                                )}
                              >
                                {p.text}
                              </ins>
                            )
                          )}
                        </p>
                      )}
                      {edit.note && <p className="m-0 mt-1.5 text-[12.5px] leading-snug text-[var(--ds-muted)]">{edit.note}</p>}
                      {!canResolve && <p className="m-0 mt-1.5 text-[12px] text-[var(--ds-subtle)]">Waiting for the author to decide</p>}
                    </MarginCard>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-1 flex items-center justify-between gap-2 border-t border-[var(--ds-line-2)] pt-3">
            <span className="text-[12.5px] text-[var(--ds-muted)]">New edits</span>
            <div
              className="inline-flex rounded-[8px] bg-[var(--ds-surface-2)] p-0.5"
              role="radiogroup"
              aria-label="How new edits appear on the page"
            >
              {(
                [
                  ["inline", "In the text", <AlignLeft key="i" className="size-3" />],
                  ["card", "Side by side", <Columns2 key="c" className="size-3" />],
                ] as const
              ).map(([value, label, icon]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={mode === value}
                  onClick={() => setDiffViewMode(value)}
                  className={cn(
                    "inline-flex h-6 items-center gap-1 rounded-[6px] px-2 text-[12px] transition-colors duration-[120ms] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]",
                    mode === value
                      ? "bg-[var(--ds-surface)] font-medium text-[var(--ds-ink)] shadow-[var(--ds-shadow-s)]"
                      : "text-[var(--ds-muted)] hover:text-[var(--ds-ink)]"
                  )}
                >
                  {icon}
                  {label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12.5px] font-medium transition-colors duration-[120ms] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]",
        active
          ? "border-[var(--ds-line)] bg-[var(--ds-surface)] text-[var(--ds-ink)] shadow-[var(--ds-shadow-s)]"
          : "border-transparent text-[var(--ds-muted)] hover:text-[var(--ds-ink)]"
      )}
    >
      {icon}
      {label}
      <span className="ds-mono text-[11.5px] font-normal text-[var(--ds-subtle)]">{count}</span>
    </button>
  );
}
