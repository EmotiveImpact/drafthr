import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Eye, Folder, Lock, PanelRight, Pencil, Trash2, User } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { BrandMark } from "@/components/ds/BrandMark";
import { MarginCard } from "@/components/journey/ui";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { diffHtmlAsSuggestion } from "@/lib/tiptap/html-diff";
import { sanitizeLetterHtml } from "@/lib/sanitize";
import { firstName, type ReviewVerdict } from "@/lib/journey/reviews";
import {
  ReviewerModeSwitch,
  SelectionBubble,
  YourReviewPanel,
  changeKind,
  suggestionTitle,
  useLetterSelection,
  type MyPoint,
} from "./reviewer";
import { CommentComposer, SuggestComposer } from "./Composers";
import { useReviewerMode } from "./review-ui";
import type { EvidenceSnapshot, LetterSnapshot, LinkResult, LinkState, RemotePoint, ReviewerAction } from "./trusted-api";

/**
 * The reviewer's own view outside the app (mock f4): the letter in the
 * centre with the reviewer's suggestions in lilac and comments in amber,
 * margin cards beside the paragraphs, and "Your review" on the right.
 * Used by the secure link page (/r/:token) and the expert's booking page
 * (/c/review/:bookingId). Everything the reviewer does goes to the server
 * through `act`; nothing here can change the letter itself.
 */

export type ThreadMessage = { id: string; mine: boolean; name: string; body: string; at: number };

export type ReviewerWorkspaceProps = {
  modeKey: string;
  letter: LetterSnapshot;
  state: LinkState;
  asker: { name: string };
  me: { name: string; email?: string };
  ask: string | null;
  evidence: EvidenceSnapshot[];
  facts?: { letterType: string; jurisdiction?: string | null; mode?: string };
  /** "Secure link, expires 21 Oct". */
  secureLine?: string | null;
  /** Left of the logo (the expert's "Back to inbox"). */
  back?: ReactNode;
  messages: ThreadMessage[];
  onMessage: (text: string) => Promise<boolean> | boolean;
  act: (a: ReviewerAction) => Promise<LinkResult<{ state: LinkState }>>;
  onState: (s: LinkState) => void;
  /** Runs after a successful send-back (the expert's booking is marked delivered). */
  afterSendBack?: (verdict: ReviewVerdict, note: string) => Promise<void> | void;
};

type Composer =
  | { kind: "suggest"; sectionId: string; quote?: string; edit?: RemotePoint }
  | { kind: "comment"; sectionId: string; quote?: string; edit?: RemotePoint };

export function ReviewerWorkspace(p: ReviewerWorkspaceProps) {
  const [mode, setMode] = useReviewerMode(p.modeKey);
  const [paneOpen, setPaneOpen] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [composer, setComposer] = useState<Composer | null>(null);
  const [busy, setBusy] = useState(false);
  const paperRef = useRef<HTMLDivElement | null>(null);
  const askerFirst = firstName(p.asker.name) || "They";
  const round = p.state.rounds.at(-1);
  const n = round?.n ?? 1;
  const status = p.state.status;
  const canWork = status === "out";

  const sections = useMemo(() => [...p.letter.sections].sort((a, b) => a.position - b.position), [p.letter.sections]);
  const sectionById = useMemo(() => new Map(sections.map((s) => [s.id, s])), [sections]);
  const live = useMemo(
    () =>
      p.state.points
        .filter((x) => x.round === n && !x.removed && sectionById.has(x.sectionId))
        .sort((a, b) => order(sections, a.sectionId) - order(sections, b.sectionId) || a.at - b.at),
    [p.state.points, n, sectionById, sections]
  );

  const myPoints: MyPoint[] = useMemo(
    () =>
      live.map((x) => {
        const s = sectionById.get(x.sectionId)!;
        if (x.kind === "suggestion") {
          return {
            id: x.id,
            kind: "suggestion",
            sectionId: x.sectionId,
            title: x.title || suggestionTitle(s.html, x.proposedHtml ?? "", x.note),
            where: s.title || "Letter",
            change: changeKind(s.html, x.proposedHtml ?? ""),
            note: x.note,
            proposedHtml: x.proposedHtml,
            quote: x.quote,
          };
        }
        return {
          id: x.id,
          kind: "comment",
          sectionId: x.sectionId,
          title: clip(x.note ?? "Comment"),
          where: s.title || "Letter",
          change: "comment",
          note: x.note,
          quote: x.quote,
        };
      }),
    [live, sectionById]
  );
  const numbers = useMemo(() => {
    const m = new Map<string, number>();
    let i = 0;
    for (const x of myPoints) if (x.kind === "suggestion") m.set(x.id, ++i);
    return m;
  }, [myPoints]);

  // The letter as the reviewer sees it: their suggestion marked in lilac,
  // the words they commented on in amber.
  const rendered = useMemo(
    () =>
      sections.map((s) => {
        const sug = live.find((x) => x.kind === "suggestion" && x.sectionId === s.id);
        let html = sanitizeLetterHtml(s.html);
        if (sug?.proposedHtml) {
          html = sanitizeLetterHtml(readableDiff(diffHtmlAsSuggestion(s.html, sug.proposedHtml, { author: p.me.name }), s.html, sug.proposedHtml));
        }
        const comments = live.filter((x) => x.kind === "comment" && x.sectionId === s.id);
        for (const c of comments) if (c.quote) html = highlight(html, c.quote, c.id);
        return { ...s, html, hasSuggestion: !!sug, hasComment: comments.length > 0 };
      }),
    [sections, live, p.me.name]
  );

  const root = useCallback(() => paperRef.current, []);
  const anchor = useLetterSelection(canWork && mode !== "read", root);

  const run = async (a: ReviewerAction): Promise<boolean> => {
    setBusy(true);
    try {
      const res = await p.act(a);
      if (!res.ok) {
        toast.error(res.message);
        return false;
      }
      p.onState(res.data.state);
      return true;
    } finally {
      setBusy(false);
    }
  };

  const submitSuggestion = async (sectionId: string, proposedHtml: string, note: string | undefined, edit?: RemotePoint, quote?: string) => {
    const s = sectionById.get(sectionId);
    if (!s) return;
    if (edit && !(await run({ action: "remove", pointId: edit.id }))) return;
    const ok = await run({
      action: "suggest",
      sectionId,
      proposedHtml,
      note,
      quote: quote ?? edit?.quote,
      title: suggestionTitle(s.html, proposedHtml, note),
    });
    if (ok) toast(`Suggestion added. ${askerFirst} accepts or rejects it.`);
  };

  const submitComment = async (sectionId: string, body: string, quote?: string, edit?: RemotePoint) => {
    if (edit && !(await run({ action: "remove", pointId: edit.id }))) return;
    await run({ action: "comment", sectionId, note: body, quote });
  };

  const openSuggest = (sectionId: string, quote?: string) => {
    const taken = live.find((x) => x.kind === "suggestion" && x.sectionId === sectionId);
    if (taken) setComposer({ kind: "suggest", sectionId, quote, edit: taken });
    else setComposer({ kind: "suggest", sectionId, quote });
  };

  const showPoint = (x: { id: string; sectionId: string }) => {
    const el =
      paperRef.current?.querySelector<HTMLElement>(`[data-point-id="${CSS.escape(x.id)}"]`) ??
      paperRef.current?.querySelector<HTMLElement>(`[data-section-id="${CSS.escape(x.sectionId)}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    setSheetOpen(false);
  };

  const sendBack = async (verdict: ReviewVerdict, note: string): Promise<boolean> => {
    const ok = await run({ action: "send-back", verdict, note: note || undefined });
    if (ok) {
      await p.afterSendBack?.(verdict, note);
      toast(`Sent back to ${askerFirst}`);
      setSheetOpen(false);
    }
    return ok;
  };

  const composerSection = composer ? sectionById.get(composer.sectionId) : undefined;

  const panel = (
    <YourReviewPanel
      asker={p.asker}
      me={p.me}
      ask={p.ask}
      round={n}
      question={round?.question}
      status={status}
      sentBackAt={round?.backAt}
      points={myPoints}
      messages={p.messages}
      evidence={p.evidence}
      facts={p.facts}
      busy={busy}
      onMessage={p.onMessage}
      onShowPoint={showPoint}
      onEditPoint={(x) => {
        const raw = live.find((r) => r.id === x.id);
        if (!raw) return;
        setComposer(
          raw.kind === "suggestion"
            ? { kind: "suggest", sectionId: raw.sectionId, edit: raw }
            : { kind: "comment", sectionId: raw.sectionId, quote: raw.quote, edit: raw }
        );
        setSheetOpen(false);
      }}
      onRemovePoint={(x) => void run({ action: "remove", pointId: x.id })}
      onSendBack={(v, note) => sendBack(v, note)}
    />
  );

  // Once it is sent back (or closed), nothing here is suggesting or
  // commenting any more: the chip says so (REVIEW-X13).
  const chip = !canWork
    ? status === "back"
      ? `Round ${n} · sent back to ${askerFirst}`
      : status === "recalled"
        ? `Recalled by ${askerFirst} · read only`
        : "Review finished · read only"
    : mode === "suggest"
      ? `Suggesting · ${askerFirst} accepts or rejects`
      : mode === "comment"
        ? `Commenting · ${askerFirst} sees each comment`
        : "Reading · nothing you do here changes the letter";

  return (
    <div className="flex h-dvh min-h-0 w-full overflow-hidden bg-[var(--ds-surface)] text-[var(--ds-body)]" data-testid="reviewer-workspace">
      <style>{LETTER_CSS}</style>
      <section className="flex min-w-0 flex-1 flex-col" aria-label="The letter">
        {/* Top bar (60px): logo, title, secure line, mode switch */}
        <header className="flex min-h-[60px] shrink-0 items-center gap-3 border-b border-[var(--ds-line)] px-4 sm:px-[18px]">
          {p.back}
          <BrandMark size={22} />
          <div className="min-w-0 flex-1">
            <p className="m-0 truncate text-[15px] leading-[1.25] text-[var(--ds-ink)]">
              <span className="font-medium">{p.letter.title || "Letter"}</span>
              {p.letter.company && <span className="text-[var(--ds-muted)]"> · for {p.letter.company}</span>}
            </p>
            {p.secureLine && (
              <p className="m-0 mt-0.5 flex items-center gap-1 text-[12.5px] text-[var(--ds-muted)]">
                <Lock aria-hidden className="size-3 shrink-0" strokeWidth={1.8} />
                <span className="truncate">{p.secureLine}</span>
              </p>
            )}
          </div>
          <ReviewerModeSwitch mode={mode} onChange={setMode} disabled={!canWork} className="max-sm:hidden" />
          <ReviewerModeSwitch mode={mode} onChange={setMode} disabled={!canWork} compact className="sm:hidden" />
          {!paneOpen && (
            <button
              type="button"
              onClick={() => setPaneOpen(true)}
              aria-label="Show your review"
              className="hidden size-8 place-items-center rounded-[8px] text-[var(--ds-muted)] hover:bg-[var(--ds-hover)] lg:grid"
            >
              <PanelRight className="size-[18px]" strokeWidth={1.6} />
            </button>
          )}
        </header>

        {/* The page */}
        <div className="@container min-h-0 flex-1 overflow-auto bg-[var(--ds-canvas)] pb-24 lg:pb-10">
          <div className="mx-auto w-full max-w-[1060px] px-4 pt-5 sm:px-12">
            <div className="mb-3 flex max-w-[640px] gap-2 max-sm:flex-wrap">
              {p.letter.about?.matter && (
                <span className="inline-flex min-h-9 min-w-0 items-center gap-2 rounded-[8px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-3 py-1.5 text-[13px] leading-[1.25] text-[var(--ds-ink)]">
                  <Folder aria-hidden className="size-3.5 shrink-0 text-[var(--ds-muted)]" strokeWidth={1.7} />
                  <span className="min-w-0">{p.letter.about.matter}</span>
                </span>
              )}
              {p.letter.about?.employee && (
                <span className="inline-flex min-h-9 min-w-0 items-center gap-2 rounded-[8px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-3 py-1.5 text-[13px] leading-[1.25] text-[var(--ds-ink)]">
                  <User aria-hidden className="size-3.5 shrink-0 text-[var(--ds-muted)]" strokeWidth={1.7} />
                  <span className="min-w-0">{p.letter.about.employee}</span>
                </span>
              )}
              <span
                className={cn(
                  "inline-flex min-h-9 min-w-0 items-center gap-2 rounded-[8px] border px-3 py-1.5 text-[13px] leading-[1.25]",
                  mode === "read" || !canWork
                    ? "border-[var(--ds-line)] bg-[var(--ds-surface)] text-[var(--ds-muted)]"
                    : "border-[var(--ds-lilac-bd)] bg-[var(--ds-lilac-soft)] text-[var(--ds-lilac-fg)]"
                )}
                data-testid="reviewer-chip"
              >
                <Eye aria-hidden className="size-3.5 shrink-0" strokeWidth={1.7} />
                {chip}
              </span>
            </div>
            <div className="relative @min-[1012px]:pr-[276px]">
              <div
                ref={paperRef}
                className="rv-letter relative w-full max-w-[640px] rounded-[3px] bg-[var(--ds-surface)] px-5 py-8 shadow-[var(--ds-shadow-m)] ring-1 ring-[var(--ds-line)] sm:px-[60px] sm:py-12"
              >
                {p.letter.company && (
                  <div className="mb-7 flex items-start justify-between gap-4 border-b border-[var(--ds-line)] pb-5 max-sm:flex-col max-sm:gap-1.5">
                    <p className="rv-company m-0 font-serif text-[20px] leading-[1.3] text-[var(--ds-ink)]">{p.letter.company}</p>
                    {p.letter.companyAddress && (
                      <p className="m-0 font-serif text-[12px] leading-[1.5] whitespace-pre-line text-[var(--ds-muted)] sm:text-right">
                        {addressLines(p.letter.companyAddress)}
                      </p>
                    )}
                  </div>
                )}
                {rendered.map((s) => (
                  <div key={s.id}>
                    <div
                      data-section-id={s.id}
                      className={cn("rv-sec relative", s.hasSuggestion && "rv-has-sug", !s.hasSuggestion && s.hasComment && "rv-has-cmt")}
                      dangerouslySetInnerHTML={{ __html: s.html }}
                    />
                    {/* Phones: the cards sit under their paragraph */}
                    {myPoints.some((x) => x.sectionId === s.id) && (
                      <div className="mb-4 flex flex-col gap-2 @min-[1012px]:hidden">
                        {myPoints
                          .filter((x) => x.sectionId === s.id)
                          .map((x) => (
                            <PointCard
                              key={x.id}
                              point={x}
                              n={numbers.get(x.id)}
                              me={p.me}
                              canWork={canWork}
                              onEdit={() => {
                                const raw = live.find((r) => r.id === x.id);
                                if (raw) setComposer(raw.kind === "suggestion" ? { kind: "suggest", sectionId: raw.sectionId, edit: raw } : { kind: "comment", sectionId: raw.sectionId, quote: raw.quote, edit: raw });
                              }}
                              onRemove={() => void run({ action: "remove", pointId: x.id })}
                              className="w-full"
                            />
                          ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {/* Wide screens: the cards beside their paragraph */}
              <MarginColumn paper={paperRef} points={myPoints} numbers={numbers} me={p.me} canWork={canWork} onEdit={(x) => {
                const raw = live.find((r) => r.id === x.id);
                if (raw) setComposer(raw.kind === "suggestion" ? { kind: "suggest", sectionId: raw.sectionId, edit: raw } : { kind: "comment", sectionId: raw.sectionId, quote: raw.quote, edit: raw });
              }} onRemove={(x) => void run({ action: "remove", pointId: x.id })} />
            </div>
          </div>
        </div>

        {/* Phones: "Your review" opens as a sheet */}
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--ds-line)] bg-[var(--ds-surface)] px-4 py-3 lg:hidden">
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-[10px] bg-[var(--ds-ink)] text-[14px] font-medium text-[var(--ds-on-accent)]"
            data-testid="open-your-review"
          >
            Your review
            {myPoints.length > 0 && <span className="text-[var(--ds-on-accent)] opacity-70">· {myPoints.length}</span>}
          </button>
        </div>
      </section>

      {/* Wide screens: the panel */}
      {paneOpen && (
        <aside
          aria-label="Your review"
          className="hidden w-[380px] shrink-0 flex-col border-l border-[var(--ds-line)] bg-[var(--ds-surface)] lg:flex"
        >
          <div className="flex h-[60px] shrink-0 items-center justify-between border-b border-[var(--ds-line)] px-4">
            <h2 className="m-0 text-[15px] font-semibold text-[var(--ds-ink)]">Your review</h2>
            <button
              type="button"
              onClick={() => setPaneOpen(false)}
              aria-label="Hide your review"
              className="grid size-8 place-items-center rounded-[8px] text-[var(--ds-muted)] transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] hover:text-[var(--ds-ink)]"
            >
              <PanelRight className="size-[18px]" strokeWidth={1.6} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-5 pb-8">{panel}</div>
        </aside>
      )}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="max-h-[88dvh] rounded-t-[16px] lg:hidden">
          <div className="flex items-center justify-between border-b border-[var(--ds-line)] px-4 py-3">
            <SheetTitle className="m-0 font-sans text-[15px] font-semibold text-[var(--ds-ink)]">Your review</SheetTitle>
            <SheetDescription className="sr-only">What you were asked, your changes and your verdict</SheetDescription>
          </div>
          <div className="min-h-0 overflow-y-auto px-4 pt-4 pb-8">{panel}</div>
        </SheetContent>
      </Sheet>

      {canWork && (
        <SelectionBubble
          anchor={anchor}
          mode={mode}
          onSuggest={(a) => openSuggest(a.sectionId, a.quote)}
          onComment={(a) => setComposer({ kind: "comment", sectionId: a.sectionId, quote: a.quote })}
        />
      )}
      {composer?.kind === "suggest" && composerSection && (
        <SuggestComposer
          open
          onOpenChange={(o) => !o && setComposer(null)}
          sectionTitle={composerSection.title || "this part"}
          html={composer.edit?.proposedHtml ?? composerSection.html}
          quote={composer.quote}
          initialNote={composer.edit?.note}
          onSubmit={(html, note) => void submitSuggestion(composerSection.id, html, note, composer.edit, composer.quote)}
        />
      )}
      {composer?.kind === "comment" && composerSection && (
        <CommentComposer
          open
          onOpenChange={(o) => !o && setComposer(null)}
          sectionTitle={composerSection.title || "this part"}
          quote={composer.quote}
          initialBody={composer.edit?.note}
          onSubmit={(body) => void submitComment(composerSection.id, body, composer.quote, composer.edit)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function PointCard({
  point,
  n,
  me,
  canWork,
  onEdit,
  onRemove,
  top,
  className,
  cardRef,
}: {
  point: MyPoint;
  n?: number;
  me: { name: string; email?: string };
  canWork: boolean;
  onEdit: () => void;
  onRemove: () => void;
  top?: number;
  className?: string;
  cardRef?: (el: HTMLElement | null) => void;
}) {
  return (
    <div ref={cardRef} style={top != null ? { position: "absolute", top, left: 0 } : undefined} className={className} data-point-id={point.id}>
      <MarginCard
        kind={point.kind === "suggestion" ? "reviewer" : "comment"}
        author={{ name: me.name, seed: me.email ?? me.name }}
        meta={point.kind === "suggestion" ? (n ? `Suggestion ${n}` : "Suggestion") : "Comment"}
        className="w-full max-w-full lg:w-64"
        actions={
          canWork ? (
            <div className="flex gap-1">
              <button type="button" onClick={onEdit} aria-label={`Edit: ${point.title}`} className="inline-flex h-7 items-center gap-1 rounded-[7px] px-2 text-[12.5px] text-[var(--ds-muted)] hover:bg-[var(--ds-hover)] hover:text-[var(--ds-ink)]">
                <Pencil className="size-3" />
                Edit
              </button>
              <button type="button" onClick={onRemove} aria-label={`Remove: ${point.title}`} className="inline-flex h-7 items-center gap-1 rounded-[7px] px-2 text-[12.5px] text-[var(--ds-muted)] hover:bg-[var(--ds-hover)] hover:text-[var(--ds-ink)]">
                <Trash2 className="size-3" />
                Remove
              </button>
            </div>
          ) : undefined
        }
      >
        <p className="m-0 text-[13px] leading-[1.5] text-[var(--ds-muted)]">
          {point.kind === "suggestion" ? point.note || point.title : point.note}
        </p>
      </MarginCard>
    </div>
  );
}

function MarginColumn({
  paper,
  points,
  numbers,
  me,
  canWork,
  onEdit,
  onRemove,
}: {
  paper: React.RefObject<HTMLDivElement | null>;
  points: MyPoint[];
  numbers: Map<string, number>;
  me: { name: string; email?: string };
  canWork: boolean;
  onEdit: (p: MyPoint) => void;
  onRemove: (p: MyPoint) => void;
}) {
  const [tops, setTops] = useState<Record<string, number>>({});
  const cards = useRef(new Map<string, HTMLElement>());
  const measure = useCallback(() => {
    const el = paper.current;
    if (!el) return;
    const next: Record<string, number> = {};
    let floor = 0;
    for (const x of points) {
      const target =
        el.querySelector<HTMLElement>(`mark[data-point-id="${CSS.escape(x.id)}"]`) ??
        el.querySelector<HTMLElement>(`[data-section-id="${CSS.escape(x.sectionId)}"]`);
      const want = target ? offsetWithin(target, el) : 0;
      const top = Math.max(want, floor);
      next[x.id] = top;
      floor = top + (cards.current.get(x.id)?.offsetHeight ?? 110) + 10;
    }
    setTops((prev) => (sameTops(prev, next) ? prev : next));
  }, [paper, points]);

  useLayoutEffect(() => {
    measure();
  });
  useEffect(() => {
    const el = paper.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, [paper, measure]);

  if (points.length === 0) return null;
  return (
    <div className="absolute top-0 left-[660px] hidden w-64 @min-[1012px]:block" aria-label="Your points beside the letter">
      {points.map((x) => (
        <PointCard
          key={x.id}
          point={x}
          n={numbers.get(x.id)}
          me={me}
          canWork={canWork}
          top={tops[x.id] ?? 0}
          className="w-64"
          cardRef={(node) => {
            if (node) cards.current.set(x.id, node);
            else cards.current.delete(x.id);
          }}
          onEdit={() => onEdit(x)}
          onRemove={() => onRemove(x)}
        />
      ))}
    </div>
  );
}

function offsetWithin(el: HTMLElement, container: HTMLElement): number {
  let y = 0;
  let node: HTMLElement | null = el;
  while (node && node !== container) {
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return y;
}

function sameTops(a: Record<string, number>, b: Record<string, number>): boolean {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => Math.abs(a[k] - (b[k] ?? -1)) < 1);
}

function order(sections: { id: string }[], id: string): number {
  const i = sections.findIndex((s) => s.id === id);
  return i < 0 ? 999 : i;
}

function clip(s: string, n = 64): string {
  const t = s.trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
}

/** Wrap the first exact occurrence of the quote (inside one text run) in an amber mark. */
/** "Unit 4, Quayside Park, Bristol BS1 6XN" as letterhead lines. */
function addressLines(address: string): string {
  const parts = address.split(/\s*[,\n]\s*/).filter(Boolean);
  const lines: string[] = [];
  for (const part of parts) {
    // "Unit 4" or "14" belongs with the street that follows it.
    const prev = lines[lines.length - 1];
    if (prev && /^(unit|flat|suite|floor)?\s*\d+[a-z]?$/i.test(prev)) lines[lines.length - 1] = `${prev}, ${part}`;
    else lines.push(part);
  }
  return lines.join("\n");
}

const escapeText = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * A word-by-word diff with more than two marks in one paragraph is hard to
 * read ("~~To~~As ~~support~~agreed"). Show those paragraphs the way the
 * reviewer wrote them instead: the sentences they changed struck through,
 * then their new wording, with the sentences around them left alone.
 */
export function readableDiff(wordHtml: string, oldHtml: string, newHtml: string): string {
  if (typeof DOMParser === "undefined") return wordHtml;
  const parse = (h: string) => new DOMParser().parseFromString(`<div id="rv-root">${h}</div>`, "text/html").getElementById("rv-root");
  const w = parse(wordHtml);
  const o = parse(oldHtml);
  const n = parse(newHtml);
  if (!w || !o || !n) return wordHtml;
  const wb = Array.from(w.children);
  const ob = Array.from(o.children);
  const nb = Array.from(n.children);
  if (wb.length !== ob.length || ob.length !== nb.length) return wordHtml;
  let changed = false;
  wb.forEach((block, i) => {
    const marks = block.querySelectorAll("ins[data-suggestion-id], del[data-suggestion-id]");
    if (marks.length <= 2) return;
    const id = marks[0].getAttribute("data-suggestion-id") ?? "rv";
    block.innerHTML = sentenceDiff(ob[i].textContent ?? "", nb[i].textContent ?? "", id);
    changed = true;
  });
  return changed ? w.innerHTML : wordHtml;
}

function sentenceDiff(before: string, after: string, id: string): string {
  const split = (t: string) => t.replace(/\s+/g, " ").trim().split(/(?<=[.?!])\s+/).filter(Boolean);
  const a = split(before);
  const b = split(after);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let end = 0;
  while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++;
  const oldMid = a.slice(start, a.length - end).join(" ");
  const newMid = b.slice(start, b.length - end).join(" ");
  const attrs = `data-suggestion-id="${escapeText(id)}" data-status="pending"`;
  const middle = `${oldMid ? `<del ${attrs}>${escapeText(oldMid)}</del>` : ""}${newMid ? `<ins ${attrs}>${escapeText(newMid)}</ins>` : ""}`;
  return [escapeText(a.slice(0, start).join(" ")), middle, escapeText(a.slice(a.length - end).join(" "))].filter(Boolean).join(" ");
}

function highlight(html: string, quote: string, id: string): string {
  if (typeof DOMParser === "undefined") return html;
  const needle = quote.replace(/\s+/g, " ").trim();
  if (!needle) return html;
  const doc = new DOMParser().parseFromString(`<div id="rv-root">${html}</div>`, "text/html");
  const rootEl = doc.getElementById("rv-root");
  if (!rootEl) return html;
  const walker = doc.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode() as Text | null;
  while (node) {
    const text = node.data.replace(/\s+/g, " ");
    const at = text.indexOf(needle);
    if (at >= 0 && node.data.length === text.length) {
      const range = doc.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + needle.length);
      const mark = doc.createElement("mark");
      mark.className = "rv-cmt";
      mark.setAttribute("data-point-id", id);
      range.surroundContents(mark);
      return rootEl.innerHTML;
    }
    node = walker.nextNode() as Text | null;
  }
  return html;
}

/* The reviewer's marks are lilac here (DraftHR's own stay green elsewhere). */
const LETTER_CSS = `
.rv-letter { font-family: var(--font-serif); font-size: 15.5px; line-height: 1.62; color: var(--ds-ink); overflow-wrap: anywhere; }
.rv-letter p { margin: 0 0 0.9em; }
.rv-letter ul, .rv-letter ol { margin: 0 0 0.9em 1.3em; padding: 0; }
.rv-letter h1, .rv-letter h2, .rv-letter h3 { font-weight: 600; font-size: 1em; margin: 1em 0 0.4em; }
.rv-letter table { border-collapse: collapse; margin: 0 0 0.9em; }
.rv-letter td, .rv-letter th { border: 1px solid var(--ds-line); padding: 4px 8px; }
.rv-letter img { max-width: 100%; height: auto; }
.rv-letter ins[data-suggestion-id] { color: var(--ds-lilac-fg); background: var(--ds-lilac-soft); text-decoration: underline; text-decoration-color: var(--ds-lilac-line); text-decoration-thickness: 1px; text-underline-offset: 3px; padding: 0; border-radius: 0; cursor: default; }
.rv-letter del[data-suggestion-id] { color: var(--ds-lilac-line); background: transparent; text-decoration: line-through; text-decoration-color: var(--ds-lilac-line); text-decoration-thickness: 1px; padding: 0; border-radius: 0; cursor: default; }
.rv-letter mark.rv-cmt { background: var(--ds-amber-soft); color: inherit; border-bottom: 1px solid var(--ds-amber-dot); padding: 0; }
.rv-letter .rv-has-sug::before, .rv-letter .rv-has-cmt::before { content: ""; position: absolute; left: -22px; top: 4px; bottom: 14px; width: 2px; border-radius: 2px; background: var(--ds-lilac-line); }
.rv-letter .rv-has-cmt::before { background: var(--ds-amber-dot); }
@media (max-width: 639px) { .rv-letter .rv-has-sug::before, .rv-letter .rv-has-cmt::before { left: -12px; } }
`;

