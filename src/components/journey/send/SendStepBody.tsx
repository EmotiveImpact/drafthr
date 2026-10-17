import { useEffect, useRef, useState, type RefObject } from "react";
import { Check } from "lucide-react";
import type { SendFlow } from "./useSendFlow";
import {
  BlockLine,
  CounselNote,
  DateGivenField,
  DownloadChips,
  EmailDateNote,
  EmailErrorBox,
  GivenByField,
  OpenFullPageCard,
  SectionLabel,
  SendButton,
  WayCards,
} from "./parts";

/**
 * The Send step's content (mock f7-send, "Open full page" from as-panel-c).
 * `frozen` is the moment right after sending: the same choices, read-only,
 * with the button reading "Sent", before the panel turns into What's next.
 * Everything keeps its place in that moment (the counsel line stays), and
 * "Open full page" is left out: the letter is sent, and the card would only
 * sit cut off under the panel's foot while it fades (SEND-X40).
 */
export function SendStepBody({ flow, frozen = false }: { flow: SendFlow; frozen?: boolean }) {
  const { recipient, prefs, draft } = flow;
  const heading = recipient.short ? `How will ${recipient.short} get it?` : "How will they get it?";
  const self = prefs.way === "self";

  return (
    <section
      data-slot="send-stage"
      aria-label="Send"
      inert={frozen || undefined}
      aria-hidden={frozen || undefined}
      className="-mt-[2px]"
    >
      <SectionLabel className="mt-0.5">{heading}</SectionLabel>
      <WayCards flow={flow} variant="panel" />
      {self ? (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <GivenByField flow={flow} />
            <DateGivenField flow={flow} />
          </div>
          <SectionLabel>Download</SectionLabel>
          <DownloadChips flow={flow} />
        </>
      ) : (
        <EmailDateNote />
      )}
      <CounselNote flow={flow} />
      {!frozen && <EmailErrorBox flow={flow} />}
      {frozen ? (
        <div className="mt-4 inline-flex h-[42px] w-full items-center justify-center gap-[7px] rounded-[10px] bg-[var(--ds-accent)] text-[14.5px] font-medium text-[var(--ds-on-accent)]">
          <Check aria-hidden className="size-4" />
          Sent
        </div>
      ) : (
        <PinnedSendBar flow={flow} draftId={draft.id} />
      )}
      {!frozen && flow.gate}
    </section>
  );
}

/**
 * Only the button (and why it is disabled) stays in view at the foot of the
 * panel while the step scrolls, above the Ask DraftHR chips (SEND-X5);
 * "Open full page" follows the step under it, so the bar covers as little
 * of the step as it can: at 1440x900 nothing of the step is under it, and
 * on shorter screens what scrolls under it fades into it instead of being
 * cut in half (SEND-X30). The panel's own bottom fade is off while the bar
 * is pinned (globals.css), so the button is never faded either.
 */
function PinnedSendBar({ flow, draftId }: { flow: SendFlow; draftId: string }) {
  const barRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLSpanElement>(null);
  const cardRef = useRef<HTMLAnchorElement>(null);
  const { stuck, nearFoot, peek } = useStuck(barRef, endRef, cardRef);
  return (
    <>
      <div
        ref={barRef}
        data-slot="send-button-bar"
        data-stuck={stuck || undefined}
        data-near-foot={nearFoot || undefined}
        className={
          "sticky bottom-0 z-10 -mx-1 flex flex-col bg-[var(--ds-surface)] px-1 pb-2 " +
          // The fade above the pinned bar: what scrolls under it dissolves.
          "before:pointer-events-none before:absolute before:inset-x-0 before:-top-8 before:h-8 before:bg-gradient-to-b before:from-transparent before:to-[var(--ds-surface)] before:opacity-0 data-[stuck]:before:opacity-100"
        }
      >
        {/* Why it is disabled stays with the button. */}
        <BlockLine block={flow.block} />
        <SendButton flow={flow} className={flow.block ? "mt-2" : undefined} />
      </div>
      {/* Marks where the bar sits in the flow: it is pinned while it shows above this. */}
      <span ref={endRef} aria-hidden className="block h-0" />
      {/* Follows the step: at 1440x900 every choice, the counsel line and
       * the button fit above the fold, and this card is the one thing the
       * panel scrolls to (SEND-X30). */}
      <OpenFullPageCard ref={cardRef} draftId={draftId} peek={peek} className="mb-2" />
    </>
  );
}

/** The panel's bottom fade, in px, when nothing is pinned (globals.css `.ai-panel-scroll[data-more-below]`). */
const PANEL_FADE_PX = 36;

/**
 * Where the sticky bar is: `stuck` while it is pinned away from its place in
 * the flow (marked by `end`, right after it), and `nearFoot` while it sits
 * in its place within the panel's bottom fade. Then the fade is shortened
 * to the room under the bar (--send-foot-fade on the scroll area), so it
 * fades what follows the bar ("Open full page") and never the button.
 * `peek` while all that shows of "Open full page" lies in that bottom fade:
 * a sliver of its dashed edge under the button, which the card then hides
 * until the panel is scrolled to it (SEND-X41).
 */
function useStuck(
  barRef: RefObject<HTMLElement | null>,
  endRef: RefObject<HTMLElement | null>,
  cardRef: RefObject<HTMLElement | null>
): { stuck: boolean; nearFoot: boolean; peek: boolean } {
  const [state, setState] = useState({ stuck: false, nearFoot: false, peek: false });
  useEffect(() => {
    const bar = barRef.current;
    const end = endRef.current;
    if (!bar || !end) return;
    let scroller: HTMLElement | null = bar.parentElement;
    while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
    const measure = () => {
      const b = bar.getBoundingClientRect();
      const stuck = end.getBoundingClientRect().top - b.bottom > 1;
      const foot = scroller ? scroller.getBoundingClientRect().bottom : Infinity;
      const room = foot - b.bottom;
      const nearFoot = !stuck && room < PANEL_FADE_PX;
      const card = cardRef.current;
      const shown = card ? foot - card.getBoundingClientRect().top : 0;
      const peek = !stuck && shown > 0 && shown < PANEL_FADE_PX;
      if (scroller) {
        if (nearFoot) scroller.style.setProperty("--send-foot-fade", `${Math.max(0, Math.round(room))}px`);
        else scroller.style.removeProperty("--send-foot-fade");
      }
      setState((s) =>
        s.stuck === stuck && s.nearFoot === nearFoot && s.peek === peek ? s : { stuck, nearFoot, peek }
      );
    };
    measure();
    const target: HTMLElement | Window = scroller ?? window;
    target.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    if (scroller) ro?.observe(scroller);
    if (scroller?.firstElementChild) ro?.observe(scroller.firstElementChild);
    if (bar.parentElement) ro?.observe(bar.parentElement);
    return () => {
      target.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
      ro?.disconnect();
      scroller?.style.removeProperty("--send-foot-fade");
    };
  }, [barRef, endRef, cardRef]);
  return state;
}
