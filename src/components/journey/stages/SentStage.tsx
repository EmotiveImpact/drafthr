import { useEffect, useState } from "react";
import { useDraftStore } from "@/lib/store";
import { SEND_FADE_MS, useJourneyUI, useSendMoment } from "@/components/journey/ui-store";
import { useSendFlow } from "@/components/journey/send/useSendFlow";
import { SendStepBody } from "@/components/journey/send/SendStepBody";
import { WhatsNext } from "@/components/journey/send/WhatsNext";
import { cn } from "@/lib/utils";

function reducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** Bring the top of the letter into view (letter-live: the canvas scrolls up). */
function scrollLetterToTop() {
  const canvas =
    document.querySelector<HTMLElement>('[data-slot="letter-canvas"]') ??
    (() => {
      let el = document.querySelector<HTMLElement>('[data-slot="letter-wrapper"], [data-slot="letter-page"]');
      while (el && el !== document.body) {
        const s = getComputedStyle(el);
        if (/(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight) return el;
        el = el.parentElement;
      }
      return null;
    })();
  if (!canvas || canvas.scrollTop === 0) return;
  canvas.scrollTo({ top: 0, behavior: reducedMotion() ? "auto" : "smooth" });
}

/**
 * Sent step of the Progress panel (mock f8-sent): What's next for the
 * matter. Props are fixed: { draftId }.
 *
 * Right after sending (useJourneyUI.justSent), the Send step stays for a
 * moment, read-only with "Sent" on its button, while the seal draws on the
 * letter and the banner rises; then it fades out and What's next fades in
 * (letter-live). Reopened later, What's next shows straight away. The
 * timing is useSendMoment, shared with the Progress panel's what-to-do line
 * so the two swap together (SEND-X36).
 */
export function SentStage({ draftId }: { draftId: string }) {
  const draft = useDraftStore((s) => s.drafts[draftId]);
  const justSent = useJourneyUI((s) => s.justSent);
  const flow = useSendFlow(draftId, "panel");
  const phase = useSendMoment(draftId);
  const [shown, setShown] = useState(phase === "next");

  useEffect(() => {
    const age = justSent && justSent.draftId === draftId ? Date.now() - justSent.at : Infinity;
    if (age < 4000) scrollLetterToTop();
    // Runs once, when the stage first shows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase !== "next" || shown) return;
    const r = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(r);
  }, [phase, shown]);

  if (!draft) return null;

  if (phase !== "next" && flow) {
    return (
      <div
        className={cn(
          "transition-opacity ease-out motion-reduce:transition-none",
          phase === "fade" ? "opacity-0" : "opacity-100"
        )}
        style={{ transitionDuration: `${SEND_FADE_MS}ms` }}
      >
        <SendStepBody flow={flow} frozen />
      </div>
    );
  }

  return (
    <div
      data-slot="sent-stage"
      className={cn(
        "transition-opacity duration-300 ease-out motion-reduce:transition-none",
        shown ? "opacity-100" : "opacity-0"
      )}
    >
      <WhatsNext draft={draft} />
    </div>
  );
}
