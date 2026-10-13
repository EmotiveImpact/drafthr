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
          <BlockLine block={flow.block} />
        </>
      )}
      {frozen ? (
        <div className="mt-4 inline-flex h-[42px] w-full items-center justify-center gap-[7px] rounded-[10px] bg-[var(--ds-accent)] text-[14.5px] font-medium text-[var(--ds-on-accent)]">
          <Check aria-hidden className="size-4" />
          Sent
        </div>
      ) : (
        // Phones: the button stays at the foot of the sheet while it scrolls.
        <div className="max-md:sticky max-md:bottom-0 max-md:z-10 max-md:-mx-1 max-md:bg-[var(--ds-surface)] max-md:px-1 max-md:pb-2">
          <SendButton flow={flow} />
        </div>
      )}
      <OpenFullPageCard draftId={draft.id} />
      {!frozen && flow.gate}
    </section>
  );
}
