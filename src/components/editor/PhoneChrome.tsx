import { useLayoutEffect, useMemo, type RefObject } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Clock3, Info, ListChecks, MessageSquare, MoreHorizontal, Share2, TriangleAlert } from "lucide-react";
import type { Draft, Matter } from "@/lib/letters/types";
import type { JourneyInfo } from "@/lib/journey/stage";
import { computeHealthScore, runHealthChecks, type HealthCheck } from "@/lib/finalize/healthChecks";
import { StatusPill } from "@/components/journey/ui";
import { cn } from "@/lib/utils";
import { EditableTitleBar } from "./EditableTitleBar";
import { InvitePopover } from "./InvitePopover";
import { MainAction, MoreMenu, type DocumentBarProps } from "./DocumentBar";
import { ScoreRing } from "./LetterHealthCard";
import { placeholdersIn, sectionForCheck, textOf } from "./health-fix";
import { fmtDay } from "./letter-facts";
import { ReviewerModeSwitch } from "@/components/journey/review/reviewer";
import { useReviewerMode } from "@/components/journey/review/review-ui";

/**
 * The letter at phone width (mock phone-letter): a top bar with back, the
 * letter's name and who and what it is for, Share and the overflow menu;
 * a strip with the status, the health ring and the send-by date; the page;
 * and a bottom bar with Progress, Chat and the stage's main action.
 */

const iconBtn =
  "grid size-10 shrink-0 place-items-center rounded-[10px] text-[var(--ds-ink)] transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] active:bg-[var(--ds-surface-3)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]";

export function PhoneTopBar({ bar, matter }: { bar: DocumentBarProps; matter?: Matter }) {
  const { draft } = bar;
  const employee = draft.employee?.legalName?.trim();
  const sub = [employee, matter?.name].filter(Boolean).join(" · ");
  // The named teammate reviewer (V1): the Read, Suggest and Comment switch
  // takes Share's place, as icons with their names for screen readers
  // (REVIEW-138).
  const reviewer = bar.journey.primaryAction?.id === "send-back";
  return (
    <div className="flex shrink-0 items-start gap-1 bg-[var(--ds-surface)] px-2 pb-1 pt-2">
      <Link to={bar.backTo} aria-label="Back to letters" title="Back to letters" className={iconBtn}>
        <ArrowLeft className="size-5" />
      </Link>
      <div className="min-w-0 flex-1 pt-1">
        <EditableTitleBar draft={draft} variant="phone" />
        {sub && <p className="m-0 mt-0.5 truncate text-[12.5px] text-[var(--ds-muted)]">{sub}</p>}
      </div>
      {reviewer ? (
        <>
          <PhoneReviewerMode draftId={draft.id} disabled={bar.role === "viewer"} />
          {/* No Share button here: "Share and invite…" in More opens the
           * People popover under More (LETTER-X44). */}
          <InvitePopover
            draft={draft}
            open={bar.inviteOpen}
            onOpenChange={bar.onInviteOpenChange}
            onOpenOnPhone={bar.onOpenOnMobile}
            anchor={() => document.querySelector("[data-phone-more]")}
          />
        </>
      ) : (
        <InvitePopover
          draft={draft}
          open={bar.inviteOpen}
          onOpenChange={bar.onInviteOpenChange}
          onOpenOnPhone={bar.onOpenOnMobile}
          trigger={
            <button type="button" aria-label="Share and invite" title="Share and invite" className={iconBtn}>
              <Share2 className="size-[19px]" />
            </button>
          }
        />
      )}
      <MoreMenu
        {...bar}
        phone
        trigger={
          <button type="button" aria-label="More" title="More" className={iconBtn} data-phone-more>
            <MoreHorizontal className="size-5" />
          </button>
        }
      />
    </div>
  );
}

function PhoneReviewerMode({ draftId, disabled }: { draftId: string; disabled: boolean }) {
  const [mode, setMode] = useReviewerMode(draftId);
  return <ReviewerModeSwitch mode={mode} onChange={setMode} disabled={disabled} compact className="mt-0.5 shrink-0" />;
}

export function PhoneStrip({ draft, journey, matter }: { draft: Draft; journey: JourneyInfo; matter?: Matter }) {
  const score = useMemo(() => computeHealthScore(runHealthChecks(draft)).score, [draft]);
  const due = matter?.deadlineISO ? new Date(matter.deadlineISO) : null;
  const showDue = due && !Number.isNaN(due.getTime()) && journey.stage !== "sent";
  const showHealth = journey.stage !== "send" && journey.stage !== "sent";
  return (
    <div className="flex shrink-0 items-center gap-2.5 border-b border-[var(--ds-line)] bg-[var(--ds-surface)] px-4 pb-2.5 pt-1">
      <StatusPill key={journey.statusLabel} tone={journey.statusTone} className="lw-fade-in shrink-0">
        {journey.statusLabel}
      </StatusPill>
      {showHealth && (
        <span className="inline-flex shrink-0 items-center gap-1.5 text-[13px] text-[var(--ds-ink)]">
          <ScoreRing score={score} size={26} stroke={2.5} numberClass="text-[11px] font-sans font-semibold" />
          Health
        </span>
      )}
      {showDue && (
        <span className="ml-auto inline-flex min-w-0 items-center gap-1.5 truncate text-[13px] text-[var(--ds-amber-fg)]">
          <Clock3 aria-hidden className="size-3.5 shrink-0" />
          <span className="truncate">Send by {fmtDay(due!)}</span>
        </span>
      )}
    </div>
  );
}

export function PhoneDisclaimer() {
  return (
    // Muted, not subtle: it sits on the canvas fill, where subtle grey
    // falls under 4.5:1.
    <p className="m-0 flex items-center justify-center gap-1.5 px-4 pb-4 pt-3 text-center text-[12px] text-[var(--ds-muted)]">
      <Info aria-hidden className="size-3.5 shrink-0" />
      DraftHR drafts letters. It does not give legal advice.
    </p>
  );
}

export function PhoneBottomBar({
  bar,
  sheetTab,
  sheetOpen,
  showMain = true,
  reviewPoints,
  onProgress,
  onChat,
}: {
  bar: DocumentBarProps;
  sheetTab: "edits" | "progress" | "chat";
  sheetOpen: boolean;
  /** The stage's main action (on phones; wider screens have it in the bar). */
  showMain?: boolean;
  /** The named teammate reviewer: the button reads "Your review · N". */
  reviewPoints?: number;
  onProgress: () => void;
  onChat: () => void;
}) {
  const tabBtn =
    "inline-flex h-[46px] min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[12px] px-2 text-[14.5px] font-medium transition-colors duration-[120ms] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]";
  const progressOn = sheetOpen && (sheetTab === "progress" || sheetTab === "edits");
  const chatOn = sheetOpen && sheetTab === "chat";
  return (
    <div
      data-slot="phone-bottom-bar"
      className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-2 border-t border-[var(--ds-line)] bg-[var(--ds-surface)] px-3 pb-[max(10px,env(safe-area-inset-bottom))] pt-2.5"
    >
      <button
        type="button"
        onClick={onProgress}
        aria-pressed={progressOn}
        className={cn(
          tabBtn,
          "flex-[1.25]",
          progressOn || !sheetOpen
            ? "bg-[var(--ds-surface-2)] text-[var(--ds-ink)] active:bg-[var(--ds-surface-3)]"
            : "text-[var(--ds-muted)] hover:bg-[var(--ds-hover)] active:bg-[var(--ds-surface-3)]"
        )}
      >
        {reviewPoints == null && <ListChecks className="size-[18px] shrink-0" />}
        {reviewPoints != null ? (
          <>
            Your review
            {reviewPoints > 0 && <span className="font-normal text-[var(--ds-muted)]">· {reviewPoints}</span>}
          </>
        ) : (
          <>
            Progress
            {bar.pendingEdits > 0 && <span className="ds-mono text-[12px] font-normal text-[var(--ds-muted)]">{bar.pendingEdits}</span>}
          </>
        )}
      </button>
      <button
        type="button"
        onClick={onChat}
        aria-pressed={chatOn}
        className={cn(
          tabBtn,
          // Beside "Your review" and "Send back to <name>", Chat keeps its icon.
          reviewPoints != null ? "w-[46px] flex-none px-0" : "flex-1",
          chatOn
            ? "bg-[var(--ds-surface-2)] text-[var(--ds-ink)] active:bg-[var(--ds-surface-3)]"
            : "text-[var(--ds-muted)] hover:bg-[var(--ds-hover)] active:bg-[var(--ds-surface-3)]"
        )}
        aria-label="Open AI agent"
      >
        <MessageSquare className="size-[18px] shrink-0" />
        {reviewPoints == null && " Chat"}
      </button>
      {showMain && (
        <div className="flex shrink-0 [&>*]:ml-0">
          <MainAction {...bar} size="phone" />
        </div>
      )}
    </div>
  );
}

type FlagHighlightRegistry = { set: (k: string, v: unknown) => void; delete: (k: string) => void };
type FlagHighlightCtor = new (...ranges: Range[]) => unknown;

export type PhoneFlagTarget = { check: HealthCheck; sectionId: string; needle?: string };

/**
 * On the phone, the passage a failing check points at is underlined in
 * amber (a CSS highlight: the editor's text is not touched). The hint line
 * under the section (PhoneFlagHint) runs that check's Fix.
 */
export function usePhoneFlag(draft: Draft, paperRef: RefObject<HTMLElement | null>, enabled: boolean): PhoneFlagTarget | null {
  const target = useMemo<PhoneFlagTarget | null>(() => {
    if (!enabled) return null;
    const checks = runHealthChecks(draft).filter((c) => c.severity === "fail" || c.severity === "warn");
    checks.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "fail" ? -1 : 1));
    for (const c of checks) {
      const section = sectionForCheck(c, draft);
      if (!section) continue;
      const text = textOf(section.html);
      const needle = c.id === "placeholders" ? placeholdersIn(text)[0] : undefined;
      return { check: c, sectionId: section.id, needle };
    }
    return null;
  }, [draft, enabled]);

  useLayoutEffect(() => {
    const css = (globalThis as unknown as { CSS?: { highlights?: FlagHighlightRegistry } }).CSS;
    const Ctor = (globalThis as unknown as { Highlight?: FlagHighlightCtor }).Highlight;
    const paper = paperRef.current;
    if (!css?.highlights || !Ctor) return;
    if (!target || !paper) {
      css.highlights.delete("lw-flag");
      return;
    }
    const sel = `[data-section-id="${CSS.escape(target.sectionId)}"]`;
    const sectionEl = paper.querySelector<HTMLElement>(`${sel} .ProseMirror`) ?? paper.querySelector<HTMLElement>(sel);
    if (!sectionEl) return;
    let range: Range | null = null;
    if (target.needle) {
      const walker = document.createTreeWalker(sectionEl, NodeFilter.SHOW_TEXT);
      let n: Node | null;
      while ((n = walker.nextNode())) {
        const i = (n.textContent ?? "").indexOf(target.needle);
        if (i >= 0) {
          range = document.createRange();
          range.setStart(n, i);
          range.setEnd(n, i + target.needle.length);
          break;
        }
      }
    }
    if (!range) {
      const blocks = sectionEl.querySelectorAll("p, li");
      const p = blocks[blocks.length - 1];
      if (p) {
        range = document.createRange();
        range.selectNodeContents(p);
      }
    }
    if (range) css.highlights.set("lw-flag", new Ctor(range));
    return () => {
      css.highlights?.delete("lw-flag");
    };
  }, [target, paperRef, draft]);

  return target;
}

/** The amber hint under the flagged section; tapping it runs the Fix. */
export function PhoneFlagHint({ target, onFix }: { target: PhoneFlagTarget; onFix: (check: HealthCheck) => void }) {
  return (
    <button
      type="button"
      onClick={() => onFix(target.check)}
      className="-mt-1 mb-3 inline-flex max-w-full items-center gap-1.5 rounded-[6px] font-sans text-[13px] leading-5 text-[var(--ds-amber-fg)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
      aria-label={`${target.check.label}. Fix it`}
    >
      <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
      <span className="min-w-0 truncate">{target.check.label}</span>
    </button>
  );
}
