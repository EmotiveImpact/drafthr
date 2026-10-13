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
      {!frozen && (
        <>
          <CounselNote flow={flow} />
          <EmailErrorBox flow={flow} />
        </>
      )}
      {frozen ? (
        <div className="mt-4 inline-flex h-[42px] w-full items-center justify-center gap-[7px] rounded-[10px] bg-[var(--ds-accent)] text-[14.5px] font-medium text-[var(--ds-on-accent)]">
          <Check aria-hidden className="size-4" />
          Sent
        </div>
      ) : (
        <PinnedSendBar flow={flow} />
      )}
      {frozen && <OpenFullPageCard draftId={draft.id} />}
      {!frozen && flow.gate}
    </section>
  );
}

/**
 * The button and "Open full page" under it stay in view at the foot of the
 * panel while the step scrolls, above the Ask DraftHR chips (SEND-X5); on a
 * phone the sheet pins the button alone. Nothing of the step sits below
 * them on a desktop, so no line is ever cut under the button; while they are pinned over more of the step, what
 * scrolls under them fades into them instead of being cut in half
 * (SEND-X30). The panel's own bottom fade is off while this bar is there
 * (globals.css), so the button is never faded either.
 */
function PinnedSendBar({ flow }: { flow: SendFlow }) {
  const barRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLSpanElement>(null);
  const stuck = useStuck(barRef, endRef);
  return (
    <>
      <div
        ref={barRef}
        data-slot="send-button-bar"
        data-stuck={stuck || undefined}
        className={
          "sticky bottom-0 z-10 -mx-1 flex flex-col bg-[var(--ds-surface)] px-1 pb-2 " +
          // The fade above the pinned bar: what scrolls under it dissolves.
          "before:pointer-events-none before:absolute before:inset-x-0 before:-top-8 before:h-8 before:bg-gradient-to-b before:from-transparent before:to-[var(--ds-surface)] before:opacity-0 data-[stuck]:before:opacity-100"
        }
      >
        {/* Why it is disabled stays with the button. */}
        <BlockLine block={flow.block} />
        <SendButton flow={flow} className={flow.block ? "mt-2" : undefined} />
        <OpenFullPageCard draftId={flow.draft.id} className="max-md:hidden" />
      </div>
      {/* Marks where the bar sits in the flow: it is pinned while it shows above this. */}
      <span ref={endRef} aria-hidden className="block h-0" />
      {/* On a phone the sheet is short, so only the button is pinned and the
       * card follows the step. */}
      <OpenFullPageCard draftId={flow.draft.id} className="mb-2 md:hidden" />
    </>
  );
}

/** True while a sticky element is pinned away from its place in the flow (marked by `end`, right after it). */
function useStuck(barRef: RefObject<HTMLElement | null>, endRef: RefObject<HTMLElement | null>): boolean {
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const bar = barRef.current;
    const end = endRef.current;
    if (!bar || !end) return;
    let scroller: HTMLElement | null = bar.parentElement;
    while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
    const measure = () => setStuck(end.getBoundingClientRect().top - bar.getBoundingClientRect().bottom > 1);
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
    };
  }, [barRef, endRef]);
  return stuck;
}
