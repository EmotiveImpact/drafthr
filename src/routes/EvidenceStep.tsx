import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, ListOrdered, Loader2, Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { EvidenceItem, Section } from "@/lib/letters/types";
import { useDraftStore } from "@/lib/store";
import { buildExpectedEvidenceStatus } from "@/lib/evidence";
import { SectionList } from "@/components/editor/WizardSidebar";
import { cn } from "@/lib/utils";
import { EvidenceRequirementsList } from "@/components/editor/EvidenceRequirementsList";
import { DeadlineBanner } from "@/components/editor/DeadlineBanner";
import { SectionEditor } from "@/components/editor/SectionEditor";
import { BAR_BTN, BAR_BTN_DARK, SegmentedTabs, SubPageBar } from "@/components/editor/SubPageChrome";
import {
  EvidencePanel,
  appendEvidenceHtml,
  buildEvidenceQuoteHtml,
  buildEvidenceReferenceHtml,
  findTargetSectionForItem,
} from "@/components/editor/EvidencePanel";
import { regenerateSection } from "@/lib/llm/draft";
import "@/components/editor/letter-workspace.css";

type RailTab = "evidence" | "required" | "sections";

/**
 * Evidence page (`/editor/:id/evidence`), in the letter workspace's
 * language:
 *
 *   - Document bar: back to the letter, the letter name and status pill,
 *     then Done (back to the letter, where the journey carries on).
 *   - Centre: the letter as one white page on the grey canvas; clicking a
 *     section makes it the target for Reference and Quote.
 *   - Side panel (380px): the evidence list (search, kind filters, cards,
 *     inline edit, Add new) in place of Edits / Progress / Chat, with the
 *     required-evidence checklist and the section list as its other tabs.
 *     Below lg the panel is a drawer with a scrim.
 */
export function EvidenceStep() {
  const { draftId } = useParams<{ draftId: string }>();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const draft = useDraftStore((s) => (draftId ? s.drafts[draftId] : undefined));
  const setEvidence = useDraftStore((s) => s.setEvidence);
  const updateSection = useDraftStore((s) => s.updateSection);
  const appendToSection = useDraftStore((s) => s.appendToSection);
  const setSectionStatus = useDraftStore((s) => s.setSectionStatus);
  const pushSectionVersion = useDraftStore((s) => s.pushSectionVersion);

  // Which section is currently "active". Drives:
  //   - left rail's section highlight
  //   - the right rail's "Reference / Quote / Link to active" buttons
  //   - URL persistence so deep links land on the right section
  const [activeSectionId, setActiveSectionId] = useState<string | null>(
    params.get("section"),
  );

  // Auto-open the Add form when arriving via ?action=add from the
  // EvidenceDrawer's "Upload new" link.
  const [autoOpenAdd, setAutoOpenAdd] = useState<boolean>(
    params.get("action") === "add",
  );

  // Per-section regen streaming flag. We can't run a global generate-all
  // from this step (the right rail isn't the AI panel), but a user CAN
  // still hit the per-section Regenerate button on a SectionEditor card,
  // so we wire up the same actions Editor.tsx uses.
  const [streamingSectionId, setStreamingSectionId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [showRail, setShowRail] = useState(false);
  const [railTab, setRailTab] = useState<RailTab>("evidence");

  // Sync the URL section param into local state when it changes.
  useEffect(() => {
    if (!draft) return;
    const requested = params.get("section");
    if (requested && draft.sections.some((section) => section.id === requested)) {
      setActiveSectionId(requested);
    } else if (!activeSectionId) {
      setActiveSectionId(defaultEvidenceSectionId(draft.sections));
    }
    // We only want to react to incoming param changes / draft changes here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.id, params]);

  // Clear autoOpenAdd once consumed. Without this, every re-render would
  // try to re-open the form even after the user closes it.
  useEffect(() => {
    if (autoOpenAdd) {
      const handle = setTimeout(() => setAutoOpenAdd(false), 0);
      return () => clearTimeout(handle);
    }
  }, [autoOpenAdd]);

  if (!draft || !draftId) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-6 py-20 text-center">
        <h1 className="m-0 font-serif text-[28px] font-normal leading-tight text-[var(--ds-ink)]">Draft not found.</h1>
        <p className="m-0 mt-2 text-[14px] leading-relaxed text-[var(--ds-muted)]">
          This letter isn't in this workspace, or it was deleted.
        </p>
        <Button variant="outline" className="mt-6" onClick={() => nav("/")}>
          <ArrowLeft className="size-4" /> Back home
        </Button>
      </div>
    );
  }

  const onChangeEvidence = (items: EvidenceItem[]) => {
    setEvidence(draft.id, items);
  };

  const onInsertAtSection = (
    item: EvidenceItem,
    kind: "reference" | "quote",
  ) => {
    const target = findTargetSectionForItem(draft, item, activeSectionId);
    if (!target) return;
    const html =
      kind === "quote"
        ? buildEvidenceQuoteHtml(item)
        : buildEvidenceReferenceHtml(item);
    if (!html) return;
    updateSection(draft.id, target.id, appendEvidenceHtml(target.html, html));
    setActiveSectionId(target.id);
    setNotice(
      `${kind === "quote" ? "Quoted" : "Referenced"} ${item.filename || item.kind} in ${target.title}.`,
    );
  };

  const onRegenerateSection = async (section: Section, instruction?: string) => {
    if (streamingSectionId) return;
    setStreamingSectionId(section.id);
    const abort = new AbortController();
    try {
      await regenerateSection(
        draft,
        section,
        {
          appendToSection,
          setSectionStatus,
          pushSectionVersion,
          updateSection,
        },
        abort.signal,
        {},
        instruction,
      );
    } catch (err) {
      console.error(err);
      alert(
        "Regeneration failed: " +
          (err instanceof Error ? err.message : "unknown error"),
      );
    } finally {
      setStreamingSectionId(null);
    }
  };

  const requiredBadge = (() => {
    const status = buildExpectedEvidenceStatus(draft);
    if (status.length === 0) return undefined;
    const ok = status.filter((row) => row.ok).length;
    return `${ok}/${status.length}`;
  })();

  const openPanel = (tab: RailTab) => {
    setRailTab(tab);
    setShowRail(true);
  };

  const toLetter = () => nav(`/editor/${draft.id}`);

  return (
    <div className="lw-root flex min-h-0 flex-1 flex-col">
      <SubPageBar
        draft={draft}
        onBack={toLetter}
        actions={
          <>
            {/* Phones: the side panel is a drawer; these open it. */}
            <button
              type="button"
              className={cn(BAR_BTN, "px-2 lg:hidden")}
              onClick={() => (showRail && railTab === "sections" ? setShowRail(false) : openPanel("sections"))}
              aria-label="Toggle sections rail"
              title="Sections"
            >
              <ListOrdered className="size-4" />
            </button>
            <button
              type="button"
              className={cn(BAR_BTN, "px-2 lg:hidden")}
              onClick={() => (showRail && railTab === "evidence" ? setShowRail(false) : openPanel("evidence"))}
              aria-label="Toggle evidence rail"
              title="Evidence"
            >
              <Paperclip className="size-4" />
              <span className="ds-mono text-[12px] text-[var(--ds-subtle)]">{draft.evidence?.length ?? 0}</span>
            </button>
            <button type="button" onClick={toLetter} className={cn(BAR_BTN_DARK, "ml-1")} title="Back to the letter">
              Done
            </button>
          </>
        }
      />

      {/* One-line notice after a Reference or Quote insert. Click to dismiss. */}
      {notice && (
        <button
          type="button"
          onClick={() => setNotice(null)}
          className="flex shrink-0 items-center justify-center gap-2 border-b border-[var(--ds-line-2)] bg-[var(--ds-green-bg)] px-4 py-1.5 text-[13px] text-[var(--ds-green-fg)] transition-colors duration-[120ms] hover:bg-[var(--ds-green-soft)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
        >
          <CheckCircle2 className="size-3.5" />
          {notice}
        </button>
      )}

      <div className="relative grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_380px]">
        <div data-page-main className="relative flex min-h-0 min-w-0 flex-col bg-[var(--ds-canvas)]">
          <div className="min-h-0 flex-1 overflow-auto">
            <div className="mx-auto w-full max-w-[640px] px-3 pb-16 pt-5 sm:px-0">
              <DeadlineBanner draft={draft} />

              {/* Mode note: the side panel is evidence here, not DraftHR. */}
              <div className="mb-3 flex items-start gap-2.5 rounded-[10px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-3.5 py-2.5 text-[13px] leading-relaxed text-[var(--ds-muted)]">
                <Paperclip className="mt-1 size-3.5 shrink-0" />
                <span>
                  <strong className="font-medium text-[var(--ds-ink)]">Linking evidence.</strong> Click a section to make
                  it the target, then use the Evidence panel to add items, link them, or insert references and quotes.
                </span>
              </div>

              <article className="lw-paper rounded-[3px] bg-[var(--ds-surface)] px-5 py-8 shadow-[var(--ds-shadow-paper)] sm:px-[60px] sm:py-12">
                {draft.sections.map((section) => (
                  <div
                    key={section.id}
                    className={cn(
                      "-mx-3 rounded-[6px] px-3 transition-colors duration-[160ms]",
                      activeSectionId === section.id && "bg-[var(--ds-surface-2)] shadow-[inset_2px_0_0_var(--ds-accent)]"
                    )}
                    data-evidence-target={activeSectionId === section.id || undefined}
                  >
                    <SectionEditor
                      draft={draft}
                      section={section}
                      variant="paper"
                      hideToolbar
                      isStreaming={streamingSectionId === section.id}
                      active={activeSectionId === section.id}
                      onFocus={() => setActiveSectionId(section.id)}
                      onChange={(html) => updateSection(draft.id, section.id, html)}
                      onRegenerate={(instr) => onRegenerateSection(section, instr)}
                      onClear={() => updateSection(draft.id, section.id, "")}
                      onShowHistory={() => {
                        // Version history lives in the letter workspace.
                        nav(`/editor/${draft.id}?section=${section.id}`);
                      }}
                      onOpenEvidenceBinder={() => {
                        // Already on the Evidence page: focus this section.
                        setActiveSectionId(section.id);
                        const el = document.querySelector(`[data-section-id="${section.id}"]`);
                        el?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }}
                      // Suggested edits are decided in the letter workspace.
                      onAcceptPending={undefined}
                      onRejectPending={undefined}
                    />
                  </div>
                ))}
                {streamingSectionId && (
                  <p className="mt-4 flex items-center gap-2 font-sans text-[12.5px] text-[var(--ds-muted)]">
                    <Loader2 className="size-3 animate-spin" />
                    Redrafting the section…
                  </p>
                )}
              </article>
            </div>
          </div>
        </div>

        {/* Side panel: permanent on lg+, a drawer on phones. */}
        <aside
          aria-label="Evidence panel"
          className={cn(
            "flex min-h-0 flex-col overflow-hidden border-l border-[var(--ds-line-2)] bg-[var(--ds-surface)]",
            showRail
              ? "fixed inset-y-0 right-0 z-40 w-[min(380px,92vw)] shadow-[var(--ds-shadow-l)] lg:static lg:w-auto lg:shadow-none"
              : "hidden lg:flex"
          )}
        >
          <div className="flex h-[60px] shrink-0 items-center gap-2 border-b border-[var(--ds-line-2)] pl-4 pr-3">
            <SegmentedTabs<RailTab>
              label="Evidence panel"
              value={railTab}
              onChange={setRailTab}
              tabs={[
                { id: "evidence", label: "Evidence", count: draft.evidence?.length ?? 0 },
                ...(requiredBadge ? [{ id: "required" as const, label: "Required", count: requiredBadge }] : []),
                { id: "sections", label: "Sections" },
              ]}
            />
            <button
              type="button"
              onClick={() => setShowRail(false)}
              aria-label="Close panel"
              className="grid size-[34px] shrink-0 place-items-center rounded-[8px] text-[var(--ds-muted)] transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] hover:text-[var(--ds-ink)] active:bg-[var(--ds-surface-3)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)] lg:hidden"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className={cn("flex min-h-0 flex-1 flex-col", railTab !== "evidence" && "hidden")}>
            <EvidencePanel
              draft={draft}
              activeSectionId={activeSectionId}
              onChangeEvidence={onChangeEvidence}
              onInsertAtSection={onInsertAtSection}
              autoOpenAdd={autoOpenAdd}
            />
          </div>
          {railTab === "required" && (
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 py-2">
              <EvidenceRequirementsList draft={draft} />
            </div>
          )}
          {railTab === "sections" && (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <SectionList
                draft={draft}
                current="evidence"
                activeSectionId={activeSectionId}
                onSelectSection={(id) => {
                  setActiveSectionId(id);
                  setShowRail(false);
                  const el = document.querySelector(`[data-section-id="${id}"]`);
                  el?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              />
            </div>
          )}
        </aside>

        {/* Phone scrim over the canvas while the drawer is open. */}
        <button
          type="button"
          className={cn(
            "fixed inset-0 z-30 bg-[var(--ds-scrim)] transition-opacity duration-200 motion-reduce:transition-none lg:hidden",
            showRail ? "opacity-100" : "pointer-events-none opacity-0"
          )}
          aria-label="Close panel"
          aria-hidden={!showRail || undefined}
          tabIndex={!showRail ? -1 : undefined}
          onClick={() => setShowRail(false)}
        />
      </div>
    </div>
  );
}

/**
 * Pick the most useful default-active section when the user lands on the
 * Evidence step without a ?section= hint. Chronology + witnesses are the
 * most evidence-heavy sections in practice, so we bias toward them.
 */
function defaultEvidenceSectionId(sections: Section[]): string | null {
  if (sections.length === 0) return null;
  const preferred = ["chronology", "witnesses", "body", "opening"] as const;
  for (const sectionId of preferred) {
    const match = sections.find((section) => section.sectionId === sectionId);
    if (match) return match.id;
  }
  return sections[0].id;
}
