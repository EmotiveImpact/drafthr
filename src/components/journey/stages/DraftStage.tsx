import { useMemo } from "react";
import { Loader2 } from "lucide-react";
import { useDraftStore } from "@/lib/store";
import { useJourney } from "@/lib/journey/stage";
import { runHealthChecks } from "@/lib/finalize/healthChecks";
import { buildExpectedEvidenceStatus } from "@/lib/evidence";
import { CheckList, CheckRow } from "@/components/journey/ui";
import { useWorkspaceFor } from "@/components/editor/workspace-store";
import { HEAVY_EVIDENCE_MIN, evidenceUsage, letterEvidenceTier } from "@/components/editor/evidence-tier";

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
    const tier = letterEvidenceTier(draft);
    const heavyShort = tier === "heavy" ? Math.max(0, HEAVY_EVIDENCE_MIN - (draft.evidence?.length ?? 0)) : 0;
    // Evidence the letter does not use yet: the same count the evidence
    // check before review gives (LETTER-X46).
    const unused = tier === "light" ? 0 : evidenceUsage(draft).unused.length;
    return { firstFail, requiredMissing, sectionNumbers, heavyShort, unused };
  }, [draft]);

  if (!journey || !draft || !facts) return null;
  const c = journey.counts;
  const streaming = c.streaming || Boolean(ws?.streaming);
  const canEdit = ws ? ws.canEdit : false;
  const h = ws?.handlers;

  const sectionsDone = !streaming && c.requiredSectionsEmpty === 0 && c.sectionsDrafted > 0;
  const allPass = c.checksTotal > 0 && c.checksPassing === c.checksTotal;

  // The approver's change request, in their words (HOME-70): the note and a
  // way to open the full feedback, so the drafter knows what to change.
  const changes =
    draft.reviewStatus === "changes_requested"
      ? [...(draft.approvals ?? [])].reverse().find((a) => a.decision === "changes_requested")
      : undefined;

  return (
    <div className="flex flex-col gap-2">
      {changes && (
        <div
          data-testid="changes-feedback"
          className="rounded-[10px] border border-[var(--ds-amber-bd)] bg-[var(--ds-amber-soft)] px-3 py-2.5"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12.5px] font-medium text-[var(--ds-amber-fg)]">
              {changes.reviewerName ? `${changes.reviewerName}'s feedback` : "The approver's feedback"}
            </span>
            {h?.openFeedback && (
              <button
                type="button"
                onClick={h.openFeedback}
                className="shrink-0 rounded-[6px] text-[12.5px] font-medium text-[var(--ds-ink)] underline underline-offset-2 hover:text-[var(--ds-body)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
              >
                Read feedback
              </button>
            )}
          </div>
          {changes.body?.trim() ? (
            <p className="m-0 mt-1 line-clamp-3 text-[13px] leading-snug text-[var(--ds-body)]">“{changes.body.trim()}”</p>
          ) : (
            <p className="m-0 mt-1 text-[13px] leading-snug text-[var(--ds-muted)]">No note was left.</p>
          )}
        </div>
      )}
      <CheckList label="Finish the draft">
        {streaming ? (
          <CheckRow
            state="wait"
            action={h?.stop ? { label: "Stop", ariaLabel: "Stop generation", onClick: h.stop } : undefined}
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
            action={h?.regenerateAll && canEdit ? { label: "Draft", ariaLabel: "Regenerate all sections", onClick: h.regenerateAll } : undefined}
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
          <CheckRow state="need" action={h?.openEvidence ? { label: canEdit ? "Add" : "Open", onClick: h.openEvidence } : undefined}>
            {plural(facts.requiredMissing, "required evidence item")} missing
          </CheckRow>
        ) : facts.heavyShort > 0 ? (
          // A heavy-evidence letter (the review handoff asks for at least 2).
          <CheckRow
            state="need"
            note={`needs ${HEAVY_EVIDENCE_MIN}`}
            action={h?.openEvidence ? { label: canEdit ? "Add" : "Open", onClick: h.openEvidence } : undefined}
          >
            {c.evidence} of {HEAVY_EVIDENCE_MIN} evidence items linked
          </CheckRow>
        ) : facts.unused > 0 ? (
          <CheckRow state="need" action={h?.openEvidence ? { label: "Open", onClick: h.openEvidence } : undefined}>
            {c.evidence - facts.unused} of {plural(c.evidence, "evidence item")} used in the letter
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
          <CheckRow state="ok" action={h?.openEvidence ? { label: canEdit ? "Add" : "Open", onClick: h.openEvidence } : undefined}>
            No evidence required
          </CheckRow>
        )}
      </CheckList>
    </div>
  );
}
