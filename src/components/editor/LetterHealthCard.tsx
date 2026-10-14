import { useEffect, useMemo, useRef, useState } from "react";
import { Check, CircleCheck, Loader2 } from "lucide-react";
import type { Draft } from "@/lib/letters/types";
import {
  DIMENSION_LABELS,
  computeHealthScore,
  runHealthChecks,
  topFixes,
  type HealthCheck,
} from "@/lib/finalize/healthChecks";
import { healthTone } from "@/components/ds";
import type { JourneyInfo } from "@/lib/journey/stage";
import { firstName, type ReviewRequest } from "@/lib/journey/reviews";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { AttentionMark } from "@/components/journey/ui";
import { checkBasis, planFix, sectionForCheck } from "./health-fix";
import { prefersReducedMotion } from "./suggestion-groups";
import { useWorkspaceFor } from "./workspace-store";

const TONE_COLOUR = {
  good: "var(--ds-health-good)",
  mid: "var(--ds-health-mid)",
  low: "var(--ds-health-low)",
} as const;

/** Count from the last shown value to the new one (about 800ms, ease out). */
export function useCountUp(target: number, ms = 800): number {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = from.current;
    if (start === target) return;
    if (prefersReducedMotion()) {
      from.current = target;
      setShown(target);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / ms);
      const eased = 1 - Math.pow(1 - k, 3);
      const v = Math.round(start + (target - start) * eased);
      setShown(v);
      from.current = v;
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return shown;
}

/** The health ring with the score in serif in its centre. */
export function ScoreRing({
  score,
  size = 46,
  stroke = 3.5,
  numberClass = "text-[18px]",
  className,
}: {
  score: number;
  size?: number;
  stroke?: number;
  numberClass?: string;
  className?: string;
}) {
  const n = Math.max(0, Math.min(100, Math.round(score)));
  const r = (size - stroke) / 2 - 0.5;
  const c = size / 2;
  const L = 2 * Math.PI * r;
  const colour = TONE_COLOUR[healthTone(n)];
  return (
    <span
      role="img"
      aria-label={`Health ${n} out of 100`}
      data-tone={healthTone(n)}
      className={cn("relative inline-grid shrink-0 place-items-center", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={c} cy={c} r={r} fill="none" stroke="var(--ds-health-track)" strokeWidth={stroke} />
        <circle
          cx={c}
          cy={c}
          r={r}
          fill="none"
          stroke={colour}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${(L * n) / 100} ${L}`}
          transform={`rotate(-90 ${c} ${c})`}
          style={{ transition: "stroke 0.3s ease" }}
        />
      </svg>
      <b className={cn("absolute inset-0 grid place-items-center font-serif font-normal text-[var(--ds-ink)] [font-variant-numeric:lining-nums_tabular-nums]", numberClass)}>
        {n}
      </b>
    </span>
  );
}

const SNAP_KEY = (draftId: string, reviewId: string) => `drafthr.scoreAtReview:${draftId}:${reviewId}`;

/**
 * Remember the score the letter had when a review went out, so Approve can
 * say "Up from 82 after Claire's changes". Stored per letter in this
 * browser; when it is missing the card shows a neutral line instead.
 */
function useScoreAtReview(draftId: string, review: ReviewRequest | null, score: number): number | null {
  const [snap, setSnap] = useState<number | null>(null);
  useEffect(() => {
    if (!review) {
      setSnap(null);
      return;
    }
    const key = SNAP_KEY(draftId, review.id);
    try {
      const raw = window.localStorage.getItem(key);
      if (raw == null && review.status === "out") {
        window.localStorage.setItem(key, String(score));
        setSnap(score);
      } else {
        setSnap(raw == null ? null : Number(raw));
      }
    } catch {
      setSnap(null);
    }
  }, [draftId, review, score]);
  return snap;
}

/**
 * Letter health (mocks f1, f3, f6; letter-live step 2): the ring and score,
 * a one-line state, the number of checks (opens them all), the three
 * dimension bars and, in Draft, the checks to fix with Fix. A fix asks
 * DraftHR for the change, which arrives as a suggested edit. When a check
 * passes its row ticks green and folds away and the number counts up.
 */
export function LetterHealthCard({
  draft,
  journey,
  canFix,
  onFix,
}: {
  draft: Draft;
  journey: JourneyInfo;
  /** The person can edit (no fixes for viewers or a locked letter). */
  canFix: boolean;
  /** Outside the letter workspace (the old /review page): what Fix does,
   *  since there is no workspace handler to ask DraftHR. */
  onFix?: (check: HealthCheck) => void;
}) {
  const ws = useWorkspaceFor(draft.id);
  const checks = useMemo(() => runHealthChecks(draft), [draft]);
  const score = useMemo(() => computeHealthScore(checks), [checks]);
  const shown = useCountUp(score.score);
  const [open, setOpen] = useState(false);
  const review = journey.review;
  const snap = useScoreAtReview(draft.id, review, score.score);

  const showFixes = journey.stage === "draft" || (journey.stage === "review" && !journey.locked);
  const failing = useMemo(
    () => [...checks.filter((c) => c.severity === "fail"), ...checks.filter((c) => c.severity === "warn")],
    [checks]
  );

  // Rows that just passed stay a moment where they were, ticked, then fold
  // away. A check passes when it was failing and no longer is, whether it now
  // reports "pass" or drops out of the list (a filled placeholder). Each
  // removal timer lives in a ref so a later draft change cannot cancel it and
  // leave the row stuck.
  const [done, setDone] = useState<Record<string, { check: HealthCheck; at: number }>>({});
  const [prevFailing, setPrevFailing] = useState<HealthCheck[]>(failing);
  if (prevFailing !== failing) {
    // Worked out during render (not in an effect) so the row never unmounts
    // between "failing" and "done": the same element turns green, draws its
    // tick and then folds.
    const now = new Set(failing.map((c) => c.id));
    const passed = prevFailing
      .map((c, at) => ({ check: c, at }))
      .filter(({ check }) => !now.has(check.id) && !checks.some((x) => x.id === check.id && x.severity !== "pass"));
    setPrevFailing(failing);
    if (passed.length > 0) {
      setDone((d) => {
        const next = { ...d };
        for (const p of passed) next[p.check.id] = p;
        return next;
      });
    }
  }
  const timers = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    for (const id of Object.keys(done)) {
      if (timers.current.has(id)) continue;
      timers.current.set(
        id,
        window.setTimeout(
          () => {
            timers.current.delete(id);
            setDone((d) => {
              const next = { ...d };
              delete next[id];
              return next;
            });
          },
          prefersReducedMotion() ? 0 : 1100
        )
      );
    }
  }, [done]);
  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const t of map.values()) window.clearTimeout(t);
      map.clear();
    };
  }, []);

  const rows: { check: HealthCheck; done: boolean }[] = useMemo(() => {
    const list = failing.map((c) => ({ check: c, done: false }));
    const finished = Object.values(done)
      .filter((d) => !list.some((r) => r.check.id === d.check.id))
      .sort((a, b) => a.at - b.at);
    for (const d of finished) list.splice(Math.min(d.at, list.length), 0, { check: d.check, done: true });
    return list;
  }, [failing, done]);

  // How many fixes reach 90 or more (the gain each fix would bring, best first).
  const fixesToNinety = useMemo(() => {
    if (score.score >= 90) return 0;
    const fixes = topFixes(checks, 50);
    let s = score.score;
    let n = 0;
    for (const f of fixes) {
      s += f.impact;
      n += 1;
      if (s >= 90) return n;
    }
    return fixes.length > 0 ? fixes.length : 0;
  }, [checks, score.score]);

  let line: React.ReactNode;
  const allPass = failing.length === 0;
  if (journey.locked && journey.stage === "review") line = "Locked while it's out for review";
  else if (journey.locked && journey.stage !== "approve") line = "Locked while someone else has it";
  else if (journey.stage === "approve") {
    const who = review ? firstName(review.reviewer.name) : "";
    if (snap != null && who && review?.status === "finished" && snap !== score.score) {
      line = `${score.score > snap ? "Up" : "Down"} from ${snap} after ${who}'s changes`;
    } else {
      line = score.oneLiner;
    }
  } else if (allPass) line = null;
  else if (fixesToNinety > 0) line = `Fix ${fixesToNinety} to reach 90 or more`;
  else line = `${failing.length} to look at`;

  const fix = (c: HealthCheck) => (ws?.handlers.fixCheck ? ws.handlers.fixCheck(c) : onFix?.(c));
  const fixing = ws?.fixing ?? {};

  return (
    <section
      data-slot="letter-health"
      aria-label="Letter health"
      className="rounded-[14px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-3.5 py-3"
    >
      <div className="flex items-center gap-3">
        <ScoreRing score={shown} />
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-medium text-[var(--ds-ink)]">Letter health</div>
          {allPass && !journey.locked && journey.stage !== "approve" ? (
            <div className="mt-px flex items-center gap-1.5 text-[12.5px] leading-snug text-[var(--ds-green-fg)]">
              <CircleCheck aria-hidden className="size-3.5 shrink-0" />
              All {score.totalCount} checks pass.
            </div>
          ) : (
            line && <div className="mt-px text-[12.5px] leading-snug text-[var(--ds-muted)]">{line}</div>
          )}
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="-mr-1 shrink-0 self-start rounded-[6px] px-1 py-0.5 text-[12.5px] text-[var(--ds-ink)] transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
        >
          {score.totalCount} checks
        </button>
      </div>

      <div className="mt-2.5 grid grid-cols-3 gap-3">
        {score.dimensions.map((d) => (
          <DimensionBar key={d.dimension} label={DIMENSION_LABELS[d.dimension]} score={d.score} />
        ))}
      </div>

      {showFixes && rows.length > 0 && (
        <ol className="m-0 mt-1 list-none p-0" aria-label="Checks to fix">
          {rows.slice(0, 4).map(({ check, done: isDone }, i) => {
            const busy = Boolean(fixing[check.id]);
            return (
              <li
                key={check.id}
                data-done={isDone || undefined}
                className="lw-fix-row mt-[9px] flex items-start gap-2.5 border-t border-[var(--ds-line-2)] pt-[9px]"
              >
                <span
                  aria-hidden
                  className="lw-fix-mark ds-mono mt-px grid size-[18px] shrink-0 place-items-center rounded-[5px] bg-[var(--ds-surface-2)] text-[11px] text-[var(--ds-muted)] transition-colors duration-300"
                >
                  {isDone ? (
                    <svg viewBox="0 0 12 12" className="lw-tick size-3" aria-hidden>
                      <path d="M2.5 6.2l2.3 2.3 4.7-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] leading-snug text-[var(--ds-ink)]">{check.label}</div>
                  <div className="mt-px text-[12px] leading-snug text-[var(--ds-muted)]">{isDone ? "Fixed" : checkBasis(check)}</div>
                </div>
                {!isDone && canFix && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => fix(check)}
                    aria-label={`Fix: ${check.label}`}
                    className="inline-flex shrink-0 items-center gap-1 rounded-[6px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-2 py-0.5 text-[12px] text-[var(--ds-ink)] transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] active:bg-[var(--ds-surface-3)] disabled:text-[var(--ds-muted)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
                  >
                    {busy && <Loader2 className="size-3 animate-spin" />}
                    {busy ? "Fixing" : "Fix"}
                  </button>
                )}
              </li>
            );
          })}
          {rows.length > 4 && (
            <li className="mt-[9px] border-t border-[var(--ds-line-2)] pt-[9px]">
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="rounded-[4px] text-[12.5px] text-[var(--ds-muted)] underline underline-offset-[3px] hover:text-[var(--ds-ink)]"
              >
                And {rows.length - 4} more
              </button>
            </li>
          )}
        </ol>
      )}

      <ChecksDialog
        open={open}
        onOpenChange={setOpen}
        draft={draft}
        checks={checks}
        canFix={canFix && showFixes}
        onFix={(c) => {
          setOpen(false);
          fix(c);
        }}
        onJump={(sectionId) => {
          setOpen(false);
          ws?.handlers.jumpToSection?.(sectionId);
        }}
      />
    </section>
  );
}

function DimensionBar({ label, score }: { label: string; score: number }) {
  const shown = useCountUp(score);
  const colour = TONE_COLOUR[healthTone(shown)];
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-1">
        <span className="truncate text-[11.5px] text-[var(--ds-muted)]">{label}</span>
        <span className="ds-mono text-[12px] text-[var(--ds-ink)]">{shown}</span>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-[var(--ds-health-track)]" aria-hidden>
        <span
          className="block h-full rounded-full"
          style={{ width: `${shown}%`, background: colour, transition: "background-color 0.3s ease" }}
        />
      </div>
    </div>
  );
}

/** Every check, grouped: failing (required), warnings (recommended), passing. */
export function ChecksDialog({
  open,
  onOpenChange,
  draft,
  checks,
  canFix,
  onFix,
  onJump,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  draft: Draft;
  checks: HealthCheck[];
  canFix: boolean;
  onFix: (c: HealthCheck) => void;
  onJump: (sectionId: string) => void;
}) {
  const groups: { title: string; items: HealthCheck[] }[] = [
    { title: "Required to fix", items: checks.filter((c) => c.severity === "fail") },
    { title: "Recommended", items: checks.filter((c) => c.severity === "warn") },
    { title: "Passing", items: checks.filter((c) => c.severity === "pass") },
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-auto sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>All {checks.length} checks</DialogTitle>
          <DialogDescription>What DraftHR checks on this letter, and where each one stands.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {groups
            .filter((g) => g.items.length > 0)
            .map((g) => (
              <section key={g.title}>
                <h3 className="m-0 mb-1 text-[12px] font-medium uppercase tracking-[0.06em] text-[var(--ds-subtle)]">
                  {g.title} <span className="ds-mono">{g.items.length}</span>
                </h3>
                <ul className="m-0 list-none p-0">
                  {g.items.map((c) => {
                    const section = c.severity !== "pass" ? sectionForCheck(c, draft) : null;
                    const plan = c.severity !== "pass" ? planFix(c, draft) : null;
                    return (
                      <li key={c.id} className="flex items-start gap-2.5 border-t border-[var(--ds-line-2)] py-2 first:border-t-0">
                        <span
                          aria-hidden
                          className={cn(
                            "mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-full text-[11px] font-semibold",
                            c.severity === "pass"
                              ? "bg-[var(--ds-green-bg)] text-[var(--ds-green-fg)]"
                              : c.severity === "fail"
                                ? "bg-[var(--ds-red-bg)] text-[var(--ds-red-fg)]"
                                : "bg-[var(--ds-amber-bg)] text-[var(--ds-amber-fg)]"
                          )}
                        >
                          {c.severity === "pass" ? <Check className="size-[11px]" strokeWidth={2.6} /> : <AttentionMark />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-[13.5px] text-[var(--ds-ink)]">
                            {c.label}
                            <span className="sr-only">
                              {c.severity === "pass" ? " (passes)" : c.severity === "fail" ? " (fails)" : " (worth a look)"}
                            </span>
                          </div>
                          {c.detail && <div className="mt-px text-[12.5px] leading-snug text-[var(--ds-muted)]">{c.detail}</div>}
                          <div className="mt-px text-[11.5px] text-[var(--ds-subtle)]">{DIMENSION_LABELS[c.dimension]}</div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {section && (
                            <button
                              type="button"
                              onClick={() => onJump(section.id)}
                              className="rounded-[6px] px-2 py-0.5 text-[12px] text-[var(--ds-muted)] transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] hover:text-[var(--ds-ink)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
                            >
                              Show
                            </button>
                          )}
                          {canFix && plan && (
                            <button
                              type="button"
                              onClick={() => onFix(c)}
                              className="rounded-[6px] border border-[var(--ds-line)] px-2 py-0.5 text-[12px] text-[var(--ds-ink)] transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
                            >
                              Fix
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
