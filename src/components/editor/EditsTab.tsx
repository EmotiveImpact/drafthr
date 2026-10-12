import { useEffect, useMemo, useState } from "react";
import { AlignLeft, CheckCheck, Columns2, MessageSquare, PenLine } from "lucide-react";
import type { Draft, PendingChange, Section } from "@/lib/letters/types";
import { useDraftStore } from "@/lib/store";
import { hasPendingSuggestions, listSuggestionsHtml } from "@/lib/tiptap/suggestion-merge";
import { getDiffViewMode, setDiffViewMode, type DiffViewMode } from "@/lib/diff-view-mode";
import { sanitizeLetterHtml } from "@/lib/sanitize";
import { cn } from "@/lib/utils";
import { EditCard, EditDiff } from "./EditCard";
import { CommentsPanel } from "./CommentsPanel";

const SOURCE_TAG: Record<PendingChange["source"], string> = {
  regenerate: "Rewrite",
  addClause: "Add a clause",
  tighten: "Tighten",
  manual: "Edit",
  review: "Suggested edit",
};

function clockFor(ts: number): string | undefined {
  if (!ts) return undefined;
  const d = new Date(ts);
  const sameDay = new Date().toDateString() === d.toDateString();
  return sameDay
    ? d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function plainText(html: string): string {
  if (typeof window === "undefined" || !html) return "";
  const el = document.createElement("div");
  el.innerHTML = sanitizeLetterHtml(html);
  return (el.textContent ?? "").replace(/\s+/g, " ").trim();
}

function clip(text: string, max = 220): string {
  return text.length > max ? text.slice(0, max - 1).trimEnd() + "…" : text;
}

/** Changed runs of an inline-diffed section, in document order. */
function inlineParts(html: string): { kind: "del" | "ins"; text: string }[] {
  if (typeof window === "undefined" || !html) return [];
  const root = document.createElement("div");
  root.innerHTML = sanitizeLetterHtml(html);
  return [...root.querySelectorAll("ins[data-suggestion-id], del[data-suggestion-id]")]
    .filter((el) => (el.getAttribute("data-status") ?? "pending") === "pending")
    .map((el) => ({
      kind: el.tagName === "DEL" ? ("del" as const) : ("ins" as const),
      text: clip((el.textContent ?? "").trim(), 140),
    }))
    .filter((p) => p.text);
}

export type EditsFilter = "edits" | "comments";

/**
 * The Edits tab of the letter side panel (14B): every change waiting for a
 * decision as a 5A card, plus the letter's comment threads behind a
 * "Comments" filter. Accept and Reject call the same store actions the page
 * uses (section proposals and single tracked changes alike).
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
  /** Accept every pending edit (with the undo toast the editor already shows). */
  onAcceptAll: () => void;
  onRejectAll: () => void;
  onJumpToSection: (sectionId: string) => void;
}) {
  const acceptSectionPending = useDraftStore((s) => s.acceptSectionPending);
  const rejectSectionPending = useDraftStore((s) => s.rejectSectionPending);
  const setSuggestionStatus = useDraftStore((s) => s.setSuggestionStatus);

  const [mode, setMode] = useState<DiffViewMode>(() => getDiffViewMode());
  useEffect(() => {
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<DiffViewMode>).detail;
      if (detail === "inline" || detail === "card") setMode(detail);
    };
    window.addEventListener("drafthr:diff-view-mode", onChange);
    return () => window.removeEventListener("drafthr:diff-view-mode", onChange);
  }, []);

  type Item =
    | { kind: "section"; section: Section; pending: PendingChange }
    | {
        kind: "mark";
        section: Section;
        id: string;
        markKind: "insertion" | "deletion";
        author: string;
        authorId?: string;
        body?: string;
        text: string;
        createdAt: number;
      };

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    for (const section of draft.sections) {
      if (section.pendingChange) {
        out.push({ kind: "section", section, pending: section.pendingChange });
        continue;
      }
      if (!hasPendingSuggestions(section.html)) continue;
      for (const s of listSuggestionsHtml(section.html)) {
        if (s.status !== "pending") continue;
        out.push({
          kind: "mark",
          section,
          id: s.id,
          markKind: s.kind,
          author: s.author,
          authorId: s.authorId,
          body: s.body,
          text: s.text,
          createdAt: s.createdAt,
        });
      }
    }
    return out;
  }, [draft.sections]);

  const comments = (draft.comments ?? []).filter((c) => !c.parentId && !c.resolved).length;

  return (
    <div className="flex min-w-0 flex-col gap-3 p-3.5">
      <div className="flex items-center gap-1" role="tablist" aria-label="Show">
        <FilterPill
          active={filter === "edits"}
          onClick={() => onFilterChange("edits")}
          icon={<PenLine className="size-3.5" />}
          label="Edits"
          count={items.length}
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
        <div className="-mx-1 min-w-0">
          <CommentsPanel draft={draft} />
        </div>
      ) : (
        <>
          <div className="flex min-h-7 items-center justify-between gap-2.5 px-0.5">
            <span className="min-w-0 truncate text-[12.5px] text-[var(--ds-muted)]" aria-live="polite">
              {items.length > 0 ? (
                <>
                  <b className="font-semibold text-[var(--ds-ink)]">{items.length}</b>{" "}
                  {items.length === 1 ? "edit" : "edits"} to review
                </>
              ) : (
                "Nothing to review"
              )}
            </span>
            {items.length > 0 && canResolve && (
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={onRejectAll}
                  className="h-7 rounded-[var(--ds-r-s)] px-2 text-[12.5px] font-medium text-[var(--ds-muted)] hover:bg-[var(--ds-surface-2)] hover:text-[var(--ds-ink)]"
                  title="Reject every pending edit"
                >
                  Reject all
                </button>
                <button
                  type="button"
                  onClick={onAcceptAll}
                  className="inline-flex h-7 items-center gap-1.5 rounded-[var(--ds-r-s)] bg-[var(--ds-accent)] px-2.5 text-[12.5px] font-medium text-[var(--ds-on-accent)] hover:bg-[var(--ds-accent-hover)]"
                  title="Accept every pending edit"
                >
                  <CheckCheck className="size-3.5" />
                  Accept all
                </button>
              </div>
            )}
          </div>

          {items.length === 0 ? (
            <div className="rounded-[var(--ds-r-m)] bg-[var(--ds-surface-2)] px-4 py-6 text-center">
              <p className="m-0 text-[13px] font-medium text-[var(--ds-ink)]">No edits waiting</p>
              <p className="m-0 mx-auto mt-1 max-w-[30ch] text-[12.5px] leading-relaxed text-[var(--ds-muted)]">
                When DraftHR or a reviewer suggests a change, it appears here for you to accept or reject.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {items.map((it, i) => {
                if (it.kind === "section") {
                  const p = it.pending;
                  const human = Boolean(p.authorName);
                  const inline = (p.diffViewMode ?? "inline") === "inline";
                  const parts = inline ? inlineParts(it.section.html) : [];
                  const diff =
                    parts.length > 0 ? (
                      <EditDiff parts={parts} />
                    ) : (
                      <div className="flex flex-col gap-1">
                        <p className="m-0 line-clamp-2 text-[var(--ds-faint)] line-through decoration-[var(--ds-faint)]">
                          {clip(plainText(p.prevHtml ?? it.section.html), 160)}
                        </p>
                        <p className="m-0 line-clamp-4 text-[var(--ds-blue-fg)]">
                          {clip(plainText(p.proposedHtml))}
                        </p>
                      </div>
                    );
                  const why = p.instruction && p.instruction !== "Suggested edit" ? p.instruction : undefined;
                  return (
                    <EditCard
                      key={`sec-${it.section.id}`}
                      author={human ? p.authorName! : "DraftHR"}
                      human={human}
                      seed={p.authorId ?? p.authorName}
                      time={clockFor(p.createdAt)}
                      tag={SOURCE_TAG[p.source] ?? "Edit"}
                      section={it.section.title}
                      diff={diff}
                      justification={why}
                      emphasis={i === 0}
                      canResolve={canResolve}
                      onAccept={() => acceptSectionPending(draft.id, it.section.id)}
                      onReject={() => rejectSectionPending(draft.id, it.section.id)}
                      onJump={() => onJumpToSection(it.section.id)}
                    />
                  );
                }
                const isAi = !it.author || /draft\s?hr|^ai$/i.test(it.author);
                return (
                  <EditCard
                    key={`mark-${it.id}`}
                    author={isAi ? "DraftHR" : it.author}
                    human={!isAi}
                    seed={it.authorId ?? it.author}
                    time={clockFor(it.createdAt)}
                    tag={it.markKind === "deletion" ? "Suggested removal" : "Suggested addition"}
                    section={it.section.title}
                    diff={<EditDiff parts={[{ kind: it.markKind === "deletion" ? "del" : "ins", text: clip(it.text, 160) }]} />}
                    justification={it.body || undefined}
                    emphasis={i === 0}
                    canResolve={canResolve}
                    onAccept={() => setSuggestionStatus(draft.id, it.id, "accepted")}
                    onReject={() => setSuggestionStatus(draft.id, it.id, "rejected")}
                    onJump={() => onJumpToSection(it.section.id)}
                  />
                );
              })}
            </div>
          )}

          <div className="mt-1 flex items-center justify-between gap-2 border-t border-[var(--ds-line)] px-0.5 pt-3">
            <span className="text-[12px] text-[var(--ds-muted)]">Show new edits</span>
            <div
              className="inline-flex rounded-[var(--ds-r-s)] bg-[var(--ds-surface-2)] p-0.5"
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
                    "inline-flex h-6 items-center gap-1 rounded-[5px] px-2 text-[11.5px] font-medium transition-colors",
                    mode === value
                      ? "bg-[var(--ds-surface)] text-[var(--ds-ink)] shadow-[var(--ds-shadow-s)]"
                      : "text-[var(--ds-muted)] hover:text-[var(--ds-ink)]",
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
        "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12.5px] font-medium transition-colors",
        active
          ? "border-[var(--ds-line-strong)] bg-[var(--ds-surface)] text-[var(--ds-ink)]"
          : "border-transparent text-[var(--ds-muted)] hover:text-[var(--ds-ink)]",
      )}
    >
      {icon}
      {label}
      <span className="ds-mono text-[11px] text-[var(--ds-muted)]">{count}</span>
    </button>
  );
}
