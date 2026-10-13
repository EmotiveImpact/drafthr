import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Check, ChevronDown, Eye, FileText, MessageSquare, Pencil, Send, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Avatar } from "@/components/ds/Avatar";
import { getLetterMeta } from "@/lib/letters/catalog";
import { REVIEW_VERDICT_LABELS, firstName, type ReviewVerdict } from "@/lib/journey/reviews";
import { MessageThread, SectionHeading } from "./parts";
import { askItems, fmtDayDate, fmtTime, plainText } from "./model";
import type { ReviewerMode } from "./review-ui";
import type { EvidenceSnapshot } from "./trusted-api";

/* ------------------------------------------------------------------ */
/*  Read / Suggest / Comment                                           */
/* ------------------------------------------------------------------ */

const MODES: { id: ReviewerMode; label: string; icon: ReactNode }[] = [
  { id: "read", label: "Read", icon: <Eye className="size-3.5" strokeWidth={1.7} /> },
  { id: "suggest", label: "Suggest", icon: <Pencil className="size-3.5" strokeWidth={1.7} /> },
  { id: "comment", label: "Comment", icon: <MessageSquare className="size-3.5" strokeWidth={1.7} /> },
];

export function ReviewerModeSwitch({
  mode,
  onChange,
  disabled,
  compact,
  className,
}: {
  mode: ReviewerMode;
  onChange: (m: ReviewerMode) => void;
  disabled?: boolean;
  /** Icons only (phone), with the names kept for screen readers. */
  compact?: boolean;
  className?: string;
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const i = MODES.findIndex((m) => m.id === mode);
    const next = MODES[(i + dir + MODES.length) % MODES.length].id;
    onChange(next);
    refs.current[next]?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label="How you're reviewing"
      onKeyDown={onKey}
      data-testid="reviewer-mode"
      className={cn("inline-flex rounded-[9px] bg-[var(--ds-surface-2)] p-[3px]", disabled && "opacity-50", className)}
    >
      {MODES.map((m) => {
        const on = m.id === mode;
        return (
          <button
            key={m.id}
            ref={(el) => {
              refs.current[m.id] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={compact ? m.label : undefined}
            tabIndex={on ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(m.id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[7px] px-2.5 py-[5px] text-[13px] outline-none transition-[background-color,color,box-shadow] duration-[120ms] focus-visible:shadow-[var(--ds-focus-ring)]",
              on
                ? "bg-[var(--ds-surface)] font-medium text-[var(--ds-ink)] shadow-[var(--ds-shadow-s)]"
                : "text-[var(--ds-muted)] hover:text-[var(--ds-ink)]"
            )}
          >
            {m.icon}
            {!compact && m.label}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Selection in the letter                                            */
/* ------------------------------------------------------------------ */

export type SelectionAnchor = { sectionId: string; quote: string; rect: { top: number; left: number; bottom: number } };

/** The words selected inside one section of the letter (inside `root`, or anywhere). */
export function useLetterSelection(enabled: boolean, root?: () => HTMLElement | null): SelectionAnchor | null {
  const [sel, setSel] = useState<SelectionAnchor | null>(null);
  useEffect(() => {
    if (!enabled) {
      setSel(null);
      return;
    }
    const onChange = () => {
      const s = window.getSelection();
      if (!s || s.rangeCount === 0 || s.isCollapsed) return setSel(null);
      const range = s.getRangeAt(0);
      const node = range.commonAncestorContainer;
      const el = (node.nodeType === 3 ? node.parentElement : node) as HTMLElement | null;
      const scope = root?.();
      if (!el || (scope && !scope.contains(el))) return setSel(null);
      const sectionEl = el.closest<HTMLElement>("[data-section-id],[data-section-anchor]");
      const sectionId = sectionEl?.getAttribute("data-section-id") ?? sectionEl?.getAttribute("data-section-anchor") ?? "";
      if (!sectionId) return setSel(null);
      const quote = (s.toString() || range.toString()).replace(/\s+/g, " ").trim().slice(0, 240);
      if (!quote) return setSel(null);
      const r = range.getBoundingClientRect();
      setSel({ sectionId, quote, rect: { top: r.top, left: r.left + r.width / 2, bottom: r.bottom } });
    };
    const clear = () => setSel(null);
    document.addEventListener("selectionchange", onChange);
    window.addEventListener("scroll", clear, true);
    return () => {
      document.removeEventListener("selectionchange", onChange);
      window.removeEventListener("scroll", clear, true);
    };
  }, [enabled, root]);
  return sel;
}

/** The small bubble over selected words: "Suggest a change" or "Comment". */
export function SelectionBubble({
  anchor,
  mode,
  onSuggest,
  onComment,
}: {
  anchor: SelectionAnchor | null;
  mode: ReviewerMode;
  onSuggest: (a: SelectionAnchor) => void;
  onComment: (a: SelectionAnchor) => void;
}) {
  if (!anchor || mode === "read") return null;
  const top = anchor.rect.top < 56 ? anchor.rect.bottom + 8 : anchor.rect.top - 44;
  return (
    <div
      role="toolbar"
      aria-label="Selected words"
      className="fixed z-50 -translate-x-1/2 rounded-[10px] border border-[var(--ds-line)] bg-[var(--ds-surface)] p-1 shadow-[var(--ds-shadow-l)]"
      style={{ top, left: Math.max(90, Math.min(anchor.rect.left, window.innerWidth - 90)) }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {mode === "suggest" ? (
        <button
          type="button"
          onClick={() => onSuggest(anchor)}
          className="inline-flex h-8 items-center gap-1.5 rounded-[7px] px-2.5 text-[13px] font-medium text-[var(--ds-lilac-ink)] hover:bg-[var(--ds-lilac-soft)]"
        >
          <Pencil className="size-3.5" />
          Suggest a change
        </button>
      ) : (
        <button
          type="button"
          onClick={() => onComment(anchor)}
          className="inline-flex h-8 items-center gap-1.5 rounded-[7px] px-2.5 text-[13px] font-medium text-[var(--ds-amber-fg)] hover:bg-[var(--ds-amber-soft)]"
        >
          <MessageSquare className="size-3.5" />
          Comment
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  The reviewer's points                                              */
/* ------------------------------------------------------------------ */

export type MyPoint = {
  id: string;
  kind: "suggestion" | "comment";
  sectionId: string;
  title: string;
  where: string;
  /** "added words", "replaced sentence", "removed words", "comment". */
  change: string;
  note?: string;
  quote?: string;
  proposedHtml?: string;
};

/** How a suggestion changes the text, in words. */
export function changeKind(oldHtml: string, newHtml: string): string {
  const a = plainText(oldHtml);
  const b = plainText(newHtml);
  const wa = words(a);
  const wb = words(b);
  if (b.length > a.length && wb.join(" ").includes(wa.join(" "))) return "added words";
  if (a.length > b.length && wa.join(" ").includes(wb.join(" "))) return "removed words";
  const kept = commonRun(wa, wb);
  const added = wb.length - kept;
  const removed = wa.length - kept;
  if (removed === 0 && added > 0) return "added words";
  if (added === 0 && removed > 0) return "removed words";
  if (removed < 3) return "replaced wording";
  // One sentence swapped for another reads as "replaced sentence".
  const split = (t: string) => t.replace(/\s+/g, " ").trim().split(/(?<=[.?!])\s+/).filter(Boolean);
  const x = split(a);
  const y = split(b);
  let start = 0;
  while (start < x.length && start < y.length && x[start] === y[start]) start++;
  let end = 0;
  while (end < x.length - start && end < y.length - start && x[x.length - 1 - end] === y[y.length - 1 - end]) end++;
  if (x.length - start - end === 1 && y.length - start - end === 1) return "replaced sentence";
  return "replaced wording";
}

/** How many words the two keep in the same order (longest common subsequence). */
function commonRun(a: string[], b: string[]): number {
  if (a.length * b.length > 400000) return Math.min(a.length, b.length);
  let prev = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array<number>(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    prev = cur;
  }
  return prev[b.length];
}

function words(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** A suggestion's title: the reviewer's note, else the words it brings in. */
export function suggestionTitle(oldHtml: string, newHtml: string, note?: string): string {
  if (note?.trim()) return clip(note.trim());
  const a = new Set(words(plainText(oldHtml)));
  const added = plainText(newHtml)
    .split(/\s+/)
    .filter((w) => w && !a.has(words(w)[0] ?? ""));
  if (added.length) return clip(`Add "${added.slice(0, 8).join(" ")}${added.length > 8 ? "…" : ""}"`);
  return "Remove some words";
}

function clip(s: string, n = 64) {
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
}

/* ------------------------------------------------------------------ */
/*  "Your review" panel (f4)                                           */
/* ------------------------------------------------------------------ */

export type ReviewerPanelProps = {
  asker: { name: string; email?: string };
  me: { name: string; email?: string };
  ask?: string | null;
  /** 1-based round; the asker's question for rounds after the first. */
  round: number;
  question?: string;
  status: "out" | "back" | "recalled" | "finished";
  sentBackAt?: number;
  points: MyPoint[];
  messages: { id: string; mine: boolean; name: string; body: string; at: number }[];
  evidence?: EvidenceSnapshot[];
  facts?: { letterType: string; jurisdiction?: string | null; mode?: string };
  /** team only, when the switch was on and they can approve. */
  canApprove?: boolean;
  approved?: boolean;
  busy?: boolean;
  onMessage: (text: string) => Promise<boolean> | boolean;
  onShowPoint: (p: MyPoint) => void;
  onEditPoint?: (p: MyPoint) => void;
  onRemovePoint: (p: MyPoint) => void;
  onSendBack: (verdict: ReviewVerdict, note: string, approve: boolean) => Promise<boolean> | boolean;
  /** Shown when there are no points yet. */
  emptyHint?: string;
};

export function YourReviewPanel(p: ReviewerPanelProps) {
  const askerFirst = firstName(p.asker.name) || "them";
  const [verdict, setVerdict] = useState<ReviewVerdict | null>(null);
  const [note, setNote] = useState("");
  const [approve, setApprove] = useState(false);
  const [sending, setSending] = useState(false);
  const [showMsgs, setShowMsgs] = useState(p.messages.length > 0);
  const items = askItems(p.ask ?? undefined);
  const changes = p.points.filter((x) => x.kind === "suggestion").length;
  const open = p.status === "out";
  const [shownRound, setShownRound] = useState(p.round);
  useEffect(() => {
    // A new round starts with a fresh verdict and note.
    if (p.round !== shownRound) {
      setShownRound(p.round);
      setVerdict(null);
      setNote("");
    }
  }, [p.round, shownRound]);
  useEffect(() => {
    if (p.messages.length > 0) setShowMsgs(true);
  }, [p.messages.length]);
  const numbered = useMemo(() => {
    let n = 0;
    return p.points.map((x) => ({ ...x, n: x.kind === "suggestion" ? ++n : undefined }));
  }, [p.points]);

  const send = async () => {
    if (!verdict || sending) return;
    setSending(true);
    const ok = await p.onSendBack(verdict, note.trim(), approve);
    setSending(false);
    if (ok) setNote("");
  };

  return (
    <div className="flex flex-col" data-testid="your-review">
      <div className="rounded-[12px] bg-[var(--ds-surface-2)] px-3.5 py-3 text-[13px] leading-[1.5] text-[var(--ds-body)]">
        <div className="mb-1.5 flex items-center gap-2 text-[12.5px] text-[var(--ds-muted)]">
          <Avatar size="sm" name={p.asker.name} seed={p.asker.email ?? p.asker.name} />
          {p.asker.name} asked you to look at
        </div>
        {items.length > 1 ? (
          <ol className="m-0 mt-1.5 list-inside list-decimal pl-0">
            {items.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ol>
        ) : items.length === 1 ? (
          <p className="m-0 whitespace-pre-wrap">{items[0]}</p>
        ) : (
          <p className="m-0">Look over the letter and suggest any changes you'd make before it goes out.</p>
        )}
      </div>

      {p.round > 1 && p.question && (
        <div className="mt-2.5 rounded-[12px] border border-[var(--ds-lilac-bd)] bg-[var(--ds-lilac-soft)] px-3.5 py-3 text-[13px] leading-[1.5] text-[var(--ds-lilac-ink)]">
          <div className="mb-1 text-[12px] font-medium tracking-[0.06em] uppercase">Round {p.round} · {askerFirst} asks</div>
          <p className="m-0 whitespace-pre-wrap">{p.question}</p>
        </div>
      )}

      {p.status === "recalled" && (
        <p className="m-0 mt-3 rounded-[10px] bg-[var(--ds-surface-2)] px-3 py-2.5 text-[13px] text-[var(--ds-body)]">
          {askerFirst} recalled this letter, so it can't be changed or sent back now.
        </p>
      )}
      {p.status === "finished" && (
        <p className="m-0 mt-3 rounded-[10px] bg-[var(--ds-green-soft)] px-3 py-2.5 text-[13px] text-[var(--ds-green-ink)]">
          {askerFirst} finished the review. Thank you.
        </p>
      )}
      {p.status === "back" && (
        <p className="m-0 mt-3 flex items-center gap-2 rounded-[10px] bg-[var(--ds-green-soft)] px-3 py-2.5 text-[13px] text-[var(--ds-green-ink)]">
          <Check className="size-4 shrink-0" />
          Sent back to {askerFirst}
          {p.sentBackAt ? ` at ${fmtTime(p.sentBackAt)}` : ""}. You'll be told if they send it back.
        </p>
      )}

      {/* Messages, folded */}
      <section className="mt-3">
        <button
          type="button"
          aria-expanded={showMsgs}
          onClick={() => setShowMsgs((v) => !v)}
          className="flex w-full items-center justify-between py-1 text-left"
        >
          <span className="text-[12px] font-medium tracking-[0.06em] text-[var(--ds-subtle)] uppercase">
            Messages{p.messages.length ? ` · ${p.messages.length}` : ""}
          </span>
          <ChevronDown className={cn("size-4 text-[var(--ds-subtle)] transition-transform duration-[120ms]", showMsgs && "rotate-180")} />
        </button>
        {showMsgs && (
          <MessageThread
            className="mt-2"
            messages={p.messages}
            them={{ name: p.asker.name, seed: p.asker.email ?? p.asker.name }}
            me={p.me}
            placeholder={`Message ${askerFirst}`}
            onSend={p.onMessage}
          />
        )}
      </section>

      <SectionHeading className="mt-4">Your changes</SectionHeading>
      {numbered.length === 0 ? (
        <p className="m-0 mt-2 text-[13px] leading-[1.45] text-[var(--ds-muted)]">
          {p.emptyHint ?? "Nothing yet. Switch to Suggest or Comment, then select words in the letter."}
        </p>
      ) : (
        <ul className="m-0 mt-1 list-none p-0" data-testid="your-changes">
          {numbered.map((x) => (
            <li key={x.id} className="group flex items-start gap-2.5 border-t border-[var(--ds-line-2)] py-2.5 text-[13px] text-[var(--ds-ink)]">
              <span
                aria-hidden
                className={cn(
                  "grid size-5 shrink-0 place-items-center rounded-[6px] text-[11px] font-semibold",
                  x.kind === "suggestion" ? "bg-[var(--ds-lilac-bg)] text-[var(--ds-lilac-fg)]" : "bg-[var(--ds-amber-bg)] text-[var(--ds-amber-fg)]"
                )}
              >
                {x.kind === "suggestion" ? x.n : <MessageSquare className="size-3" strokeWidth={2} />}
              </span>
              <button type="button" onClick={() => p.onShowPoint(x)} className="min-w-0 flex-1 text-left">
                <span className="block leading-[1.35]">{x.title}</span>
                <span className="mt-px block text-[12px] text-[var(--ds-subtle)]">
                  {x.where} · {x.change}
                </span>
              </button>
              {open && (
                <span className="flex shrink-0 gap-1 transition-opacity duration-[120ms] [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100">
                  {p.onEditPoint && (
                    <button
                      type="button"
                      onClick={() => p.onEditPoint?.(x)}
                      aria-label={`Edit: ${x.title}`}
                      className="grid size-7 place-items-center rounded-[7px] text-[var(--ds-muted)] transition-colors duration-[120ms] hover:bg-[var(--ds-surface-2)] hover:text-[var(--ds-ink)]"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => p.onRemovePoint(x)}
                    aria-label={`Remove: ${x.title}`}
                    className="grid size-7 place-items-center rounded-[7px] text-[var(--ds-muted)] transition-colors duration-[120ms] hover:bg-[var(--ds-surface-2)] hover:text-[var(--ds-ink)]"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {open && (
        <>
          <SectionHeading className="mt-4">Your verdict</SectionHeading>
          <div role="radiogroup" aria-label="Your verdict" className="mt-2 flex flex-col gap-1.5">
            {(Object.keys(REVIEW_VERDICT_LABELS) as ReviewVerdict[]).map((v) => {
              const on = verdict === v;
              return (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setVerdict(v)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-[10px] border px-3 py-[9px] text-left text-[13.5px] text-[var(--ds-ink)] outline-none transition-colors duration-[120ms] focus-visible:shadow-[var(--ds-focus-ring)]",
                    on ? "border-[var(--ds-ink)] shadow-[inset_0_0_0_1px_var(--ds-ink)]" : "border-[var(--ds-line)] hover:bg-[var(--ds-hover)]"
                  )}
                >
                  <span
                    aria-hidden
                    className={cn("size-4 shrink-0 rounded-full", on ? "border-[5px] border-[var(--ds-ink)]" : "border-[1.5px] border-[var(--ds-line-strong)]")}
                  />
                  {REVIEW_VERDICT_LABELS[v]}
                  {v === "ready-with-changes" && changes > 0 && (
                    <em className="ml-auto text-[12px] text-[var(--ds-subtle)] not-italic">
                      {changes} {changes === 1 ? "change" : "changes"}
                    </em>
                  )}
                </button>
              );
            })}
          </div>

          <SectionHeading className="mt-4">
            <label htmlFor="reviewer-note">Note to {askerFirst}</label>
          </SectionHeading>
          <textarea
            id="reviewer-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="What you think overall, and anything they should know"
            className="mt-2 block min-h-[74px] w-full resize-y rounded-[10px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-3 py-2.5 text-[13px] leading-[1.5] text-[var(--ds-ink)] outline-none placeholder:text-[var(--ds-subtle)] focus-visible:shadow-[var(--ds-focus-ring)]"
          />

          {p.canApprove && (
            <label className="mt-3 flex items-center gap-2.5 text-[13px] text-[var(--ds-body)]">
              <Switch checked={approve} onCheckedChange={setApprove} aria-label="Approve the letter as well" />
              Approve it too, so there's no separate approval step
            </label>
          )}

          <Button
            onClick={() => void send()}
            disabled={!verdict || sending || p.busy}
            className="mt-3.5 h-10 w-full text-[13.5px]"
            data-testid="reviewer-send-back"
            title={!verdict ? "Pick a verdict first" : undefined}
          >
            <Send className="size-[15px]" strokeWidth={1.8} />
            {approve ? `Send back and approve` : `Send back to ${askerFirst}`}
          </Button>
          <p className="m-0 mt-2 text-center text-[12px] text-[var(--ds-subtle)]">
            {askerFirst} decides what to accept. You'll be told if they send it back.
          </p>
        </>
      )}

      {p.evidence && p.evidence.length > 0 && <SharedFiles files={p.evidence} />}
      {p.facts && <LetterFacts {...p.facts} />}
    </div>
  );
}

export function SharedFiles({ files }: { files: EvidenceSnapshot[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <section className="mt-5">
      <SectionHeading>Files shared with you</SectionHeading>
      <ul className="m-0 mt-1 list-none p-0">
        {files.map((f) => (
          <li key={f.id} className="border-t border-[var(--ds-line-2)] py-2 text-[13px]">
            <div className="flex items-center gap-2">
              <FileText aria-hidden className="size-4 shrink-0 text-[var(--ds-subtle)]" strokeWidth={1.6} />
              <span className="min-w-0 flex-1 truncate text-[var(--ds-ink)]">{f.name}</span>
              {f.dataUrl ? (
                <a href={f.dataUrl} target="_blank" rel="noopener noreferrer" download={f.name} className="shrink-0 text-[12.5px] font-medium text-[var(--ds-ink)] underline underline-offset-[3px]">
                  Open
                </a>
              ) : f.content ? (
                <button
                  type="button"
                  aria-expanded={openId === f.id}
                  onClick={() => setOpenId(openId === f.id ? null : f.id)}
                  className="shrink-0 text-[12.5px] font-medium text-[var(--ds-ink)] underline underline-offset-[3px]"
                >
                  {openId === f.id ? "Hide" : "Read"}
                </button>
              ) : null}
            </div>
            {openId === f.id && f.content && (
              <p className="m-0 mt-2 max-h-56 overflow-y-auto rounded-[8px] bg-[var(--ds-surface-2)] px-3 py-2 text-[12.5px] leading-[1.5] whitespace-pre-wrap text-[var(--ds-body)]">
                {f.content}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function LetterFacts({ letterType, jurisdiction, mode }: { letterType: string; jurisdiction?: string | null; mode?: string }) {
  let type = letterType;
  try {
    type = getLetterMeta(letterType as Parameters<typeof getLetterMeta>[0]).title;
  } catch {
    // An unknown type shows as it is.
  }
  return (
    <section className="mt-5">
      <SectionHeading>Letter</SectionHeading>
      <dl className="m-0 mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px]">
        <dt className="text-[var(--ds-muted)]">Letter type</dt>
        <dd className="m-0 text-[var(--ds-ink)]">{type}</dd>
        <dt className="text-[var(--ds-muted)]">Jurisdiction</dt>
        <dd className="m-0 text-[var(--ds-ink)]">{jurisdiction || "Not set"}</dd>
        <dt className="text-[var(--ds-muted)]">Mode</dt>
        <dd className="m-0 text-[var(--ds-ink)]">{mode === "employee" ? "Employee" : "Employer"}</dd>
      </dl>
    </section>
  );
}

export { fmtDayDate };
