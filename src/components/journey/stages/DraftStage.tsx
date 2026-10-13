import { useJourney } from "@/lib/journey/stage";
import { CheckList, CheckRow } from "@/components/journey/ui";

/**
 * Draft step of the Progress panel (mock f1): the checklist to finish the
 * draft. Placeholder from the foundation; the letter builder owns this file
 * and replaces the body. Props are fixed: { draftId }.
 */
export function DraftStage({ draftId }: { draftId: string }) {
  const journey = useJourney(draftId);
  if (!journey) return null;
  const c = journey.counts;
  return (
    <CheckList label="Finish the draft">
      <CheckRow state={c.sectionsDrafted >= c.sections && c.requiredSectionsEmpty === 0 ? "ok" : "wait"}>
        Sections drafted ({c.sectionsDrafted} of {c.sections})
      </CheckRow>
      <CheckRow state={c.pendingSuggestions > 0 ? "need" : "ok"}>
        {c.pendingSuggestions > 0
          ? `${c.pendingSuggestions} suggested edit${c.pendingSuggestions === 1 ? "" : "s"} to decide`
          : "No suggested edits waiting"}
      </CheckRow>
      <CheckRow state={c.failingRequired > 0 ? "need" : "ok"}>
        {c.failingRequired > 0
          ? `${c.failingRequired} required check${c.failingRequired === 1 ? "" : "s"} failing`
          : `Required checks passing (${c.checksPassing} of ${c.checksTotal})`}
      </CheckRow>
      <CheckRow state={c.evidence > 0 ? "ok" : "wait"}>
        {c.evidence > 0 ? `${c.evidence} evidence item${c.evidence === 1 ? "" : "s"} linked` : "No evidence linked yet"}
      </CheckRow>
    </CheckList>
  );
}
