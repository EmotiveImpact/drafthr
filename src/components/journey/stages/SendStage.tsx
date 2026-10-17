import { useSendFlow } from "@/components/journey/send/useSendFlow";
import { SendStepBody } from "@/components/journey/send/SendStepBody";

/**
 * Send step of the Progress panel (mock f7-send, with "Open full page" from
 * as-panel-c): how the person gets the letter, how and when it was given,
 * what to download, and one button. Props are fixed: { draftId }.
 *
 * The choices are saved on the letter as they change (answers._send). The
 * button downloads each ticked file (each recorded as an export), then marks
 * the letter as sent with how and when it was given; or, with "Email it from
 * DraftHR", sends it through the server and marks it as sent only once the
 * email has gone. High-risk letters pass the counsel gate first. The panel
 * then becomes the Sent stage (SentStage) and the letter shows the seal.
 */
export function SendStage({ draftId }: { draftId: string }) {
  const flow = useSendFlow(draftId, "panel");
  if (!flow) return null;
  return <SendStepBody flow={flow} />;
}
