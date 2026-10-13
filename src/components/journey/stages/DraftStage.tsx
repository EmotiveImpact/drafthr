import { useMemo } from "react";
import { Loader2 } from "lucide-react";
import { useDraftStore } from "@/lib/store";
import { useJourney } from "@/lib/journey/stage";
import { runHealthChecks } from "@/lib/finalize/healthChecks";
import { buildExpectedEvidenceStatus } from "@/lib/evidence";
import { CheckList, CheckRow } from "@/components/journey/ui";
import { useWorkspaceFor } from "@/components/editor/workspace-store";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function listWords(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * Draft step of the Progress panel (mock f1): four rows to finish the
 * draft. Sections drafted, suggested edits to decide (Review), checks
 * passing (Fix), evidence linked (Add). Every count is the letter's own;
 * the buttons reach the workspace's handlers (the Edits tab, the first
 * failing check's fix, the evidence drawer). Outside the workspace the
 * rows show without buttons.
 */
export function DraftStage({ draftId }: { draftId: string }) {
  const journey = useJourney(draftId);
  const draft = useDraftStore((s) => s.drafts[draftId]);
  const ws = useWorkspaceFor(draftId);

  const facts = useMemo(() => {
    if (!draft) return null;
    const checks = runHealthChecks(draft);
    const firstFail = checks.find((c) => c.severity === "fail") ?? null;
    const evidenceStatus = buildExpectedEvidenceStatus(draft);
    const requiredMissing = evidenceStatus.filter((e) => e.expectation.required && !e.ok).length;
    // Sections the evidence supports: linked on the item, or cited in the text.
    const linked = new Set<string>();
    for (const e of draft.evidence ?? []) for (const id of e.sectionIds ?? []) linked.add(id);
    draft.sections.forEach((s) => {
      if (/data-fig-id="[^"]+"|data-att-id="[^"]+"/.test(s.html)) linked.add(s.id);
    });
    const sectionNumbers = draft.sections
      .map((s, i) => (linked.has(s.id) ? String(i + 1) : null))
      .filter((x): x is string => Boolean(x));
    return { firstFail, requiredMissing, sectionNumbers };
  }, [draft]);

  if (!journey || !draft || !facts) return null;
  const c = journey.counts;
  const streaming = c.streaming || Boolean(ws?.streaming);
  const canEdit = ws ? ws.canEdit : false;
  const h = ws?.handlers;

  const sectionsDone = !streaming && c.requiredSectionsEmpty === 0 && c.sectionsDrafted > 0;
  const allPass = c.checksTotal > 0 && c.checksPassing === c.checksTotal;

  return (
    <div className="flex flex-col gap-2">
      <CheckList label="Finish the draft">
        {streaming ? (
          <CheckRow
            state="wait"
            action={h?.stop ? { label: "Stop", onClick: h.stop } : undefined}
          >
            <span className="inline-flex items-center gap-1.5">
              <Loader2 aria-hidden className="size-3.5 animate-spin text-[var(--ds-muted)]" />
              Writing… {c.sectionsDrafted} of {c.sections} sections drafted
            </span>
          </CheckRow>
        ) : sectionsDone ? (
          <CheckRow state="ok" note="by DraftHR">
            {plural(c.sectionsDrafted, "section")} drafted
          </CheckRow>
        ) : (
          <CheckRow
            state="wait"
            action={h?.regenerateAll && canEdit ? { label: "Draft", onClick: h.regenerateAll } : undefined}
          >
            {c.sectionsDrafted} of {c.sections} sections drafted
          </CheckRow>
        )}

        {c.pendingSuggestions > 0 ? (
          <CheckRow
            state="wait"
            action={h?.openEdits ? { label: "Review", onClick: () => h.openEdits?.("edits") } : undefined}
          >
            {plural(c.pendingSuggestions, "suggested edit")} to decide
          </CheckRow>
        ) : (
          <CheckRow state="ok">No suggested edits</CheckRow>
        )}

        {c.failingRequired > 0 ? (
          <CheckRow
            state="need"
            action={
              h?.fixCheck && facts.firstFail
                ? { label: "Fix", onClick: () => h.fixCheck?.(facts.firstFail!), disabled: !canEdit || Boolean(ws?.fixing[facts.firstFail.id]) }
                : undefined
            }
          >
            {c.checksPassing} of {c.checksTotal} checks pass
          </CheckRow>
        ) : (
          <CheckRow state="ok">{allPass ? `All ${c.checksTotal} checks pass` : `${c.checksPassing} of ${c.checksTotal} checks pass, none blocking`}</CheckRow>
        )}

        {facts.requiredMissing > 0 ? (
          <CheckRow state="need" action={h?.openEvidence ? { label: "Add", onClick: h.openEvidence } : undefined}>
            {plural(facts.requiredMissing, "required evidence item")} missing
          </CheckRow>
        ) : c.evidence > 0 ? (
          <CheckRow
            state="ok"
            note={
              facts.sectionNumbers.length > 0
                ? `${facts.sectionNumbers.length === 1 ? "Section" : "Sections"} ${listWords(facts.sectionNumbers)}`
                : undefined
            }
          >
            {plural(c.evidence, "evidence file")} linked
          </CheckRow>
        ) : (
          <CheckRow state="ok" action={h?.openEvidence ? { label: "Add", onClick: h.openEvidence } : undefined}>
            No evidence required
          </CheckRow>
        )}
      </CheckList>
    </div>
  );
}
