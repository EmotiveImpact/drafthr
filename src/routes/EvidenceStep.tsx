import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ListOrdered,
  Loader2,
  PanelRight,
  Paperclip,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { EvidenceItem, Section } from "@/lib/letters/types";
import { useDraftStore } from "@/lib/store";
import { buildExpectedEvidenceStatus } from "@/lib/evidence";
import { SectionList } from "@/components/editor/WizardSidebar";
import { PillTabs } from "@/components/ds/PageHeader";
import { DocBar, DOC_BTN, DOC_BTN_PRIMARY } from "@/components/finalize/DocBar";
import { cn } from "@/lib/utils";
import { EvidenceRequirementsList } from "@/components/editor/EvidenceRequirementsList";
import { EditableTitleBar } from "@/components/editor/EditableTitleBar";
import { InlineDisclaimer } from "@/components/editor/InlineDisclaimer";
import { DeadlineBanner } from "@/components/editor/DeadlineBanner";
import { SectionEditor } from "@/components/editor/SectionEditor";
import {
  EvidencePanel,
  appendEvidenceHtml,
  buildEvidenceQuoteHtml,
  buildEvidenceReferenceHtml,
  findTargetSectionForItem,
} from "@/components/editor/EvidencePanel";
import { regenerateSection } from "@/lib/llm/draft";
import { getLetterMeta } from "@/lib/letters/catalog";

type RailTab = "evidence" | "required" | "sections";

/**
 * Evidence page (`/editor/:id/evidence`), laid out like the 14B workspace:
 *
 *   - Document bar (11A): back to the letter, file name, Edit / Review /
 *     Finalise, then Back to letter and Review.
 *   - Centre: the letter, as the same stacked SectionEditor cards Edit
 *     uses, so prose styling and editing affordances are identical.
 *   - Side panel: the evidence list (EvidencePanel: search, kind filters,
 *     evidence cards, inline edit, Add new) in place of Edits / Progress /
 *     Chat, with the required-evidence checklist and the section list as
 *     the panel's other tabs. Below lg the panel is a drawer.
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

  // Which section card is currently "active" — drives:
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

  // Clear autoOpenAdd once consumed — without this, every re-render would
  // try to re-open the form even after the user closes it.
  useEffect(() => {
    if (autoOpenAdd) {
      const handle = setTimeout(() => setAutoOpenAdd(false), 0);
      return () => clearTimeout(handle);
    }
  }, [autoOpenAdd]);

  if (!draft || !draftId) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12">
        <p className="text-sm text-muted-foreground">Draft not found.</p>
        <Button variant="ghost" className="mt-4" onClick={() => nav("/")}>
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

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <DocBar
        draft={draft}
        current="evidence"
        title={draft.title || getLetterMeta(draft.letterType).title}
        label="Evidence"
        leading={
          <button
            type="button"
            onClick={() => nav(`/editor/${draft.id}`)}
            aria-label="Back to letter"
            className="-mx-1 grid size-9 shrink-0 place-items-center rounded-[var(--ds-r-s)] text-[var(--ds-body)] transition hover:bg-[var(--ds-surface-2)]"
          >
            <ArrowLeft className="size-4" />
          </button>
        }
        actions={
          <>
            {/* Phones: the side panel is a drawer; these open it. */}
            <button
              type="button"
              className={cn(DOC_BTN, "px-2 lg:hidden")}
              onClick={() => (showRail && railTab === "sections" ? setShowRail(false) : openPanel("sections"))}
              aria-label="Toggle sections rail"
              title="Sections"
            >
              <ListOrdered className="size-4" />
            </button>
            <button
              type="button"
              className={cn(DOC_BTN, "px-2 lg:hidden")}
              onClick={() => (showRail && railTab === "evidence" ? setShowRail(false) : openPanel("evidence"))}
              aria-label="Toggle evidence rail"
              title="Evidence"
            >
              <PanelRight className="size-4" />
            </button>
            <Link to={`/editor/${draft.id}`} className={cn(DOC_BTN, "hidden sm:inline-flex")}>
              Back to letter
            </Link>
            <button
              type="button"
              onClick={() => nav(`/editor/${draft.id}/review`)}
              aria-label="Next: Review"
              className={cn(DOC_BTN_PRIMARY, "px-2 sm:px-3")}
            >
              <span className="hidden sm:inline">Review</span>
              <ArrowRight className="size-3.5" />
            </button>
          </>
        }
      />

      {/* One-line notice strip — appears after a Reference / Quote insert.
       * Click to dismiss. */}
      {notice && (
        <button
          type="button"
          onClick={() => setNotice(null)}
          className="flex shrink-0 items-center justify-center gap-2 border-b border-[var(--ds-line)] bg-[var(--ds-green-bg)] px-4 py-1.5 text-[12.5px] text-[var(--ds-green-fg)] transition hover:brightness-95"
        >
          <CheckCircle2 className="size-3.5" />
          {notice}
        </button>
      )}

      {/* 14B: the letter in the centre, the evidence list in the side panel
       * (in place of Edits / Progress / Chat), with Required and Sections as
       * the panel's other tabs. Below lg the panel becomes a drawer. */}
      <div className="relative grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_400px]">
        <main className="relative flex min-h-0 min-w-0 flex-col bg-[var(--ds-canvas)]">
          <div className="min-h-0 flex-1 overflow-auto">
            <div className="mx-auto max-w-3xl space-y-3 px-3 py-6 sm:px-6 sm:py-8">
              <EditableTitleBar draft={draft} />
              <InlineDisclaimer draft={draft} />
              <DeadlineBanner draft={draft} />

              {/* Mode note: the side panel is evidence here, not DraftHR. */}
              <div className="flex items-start gap-2.5 rounded-[var(--ds-r-m)] bg-[var(--ds-surface-2)] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-[var(--ds-muted)]">
                <Paperclip className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  <strong className="font-medium text-[var(--ds-ink)]">Linking evidence.</strong>{" "}
                  Click a section to make it the target, then use the Evidence panel to add items,
                  link them, or insert references and quotes.
                </span>
              </div>

              {draft.sections.map((section) => (
                <SectionEditor
                  key={section.id}
                  draft={draft}
                  section={section}
                  isStreaming={streamingSectionId === section.id}
                  active={activeSectionId === section.id}
                  onFocus={() => setActiveSectionId(section.id)}
                  onChange={(html) => updateSection(draft.id, section.id, html)}
                  onRegenerate={(instr) => onRegenerateSection(section, instr)}
                  onClear={() => updateSection(draft.id, section.id, "")}
                  onShowHistory={() => {
                    // History dialog lives on the Edit page; from here we
                    // just jump back to Edit with the section selected.
                    nav(`/editor/${draft.id}?section=${section.id}`);
                  }}
                  onOpenEvidenceBinder={() => {
                    // Already on the Evidence step — just focus this section
                    // and scroll its card into view.
                    setActiveSectionId(section.id);
                    const el = document.querySelector(
                      `[data-section-id="${section.id}"]`,
                    );
                    el?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  // Comments / pending-change flows live on the Edit page —
                  // from Evidence we just no-op. SectionEditor renders the
                  // section content + a minimal toolbar either way.
                  onAcceptPending={undefined}
                  onRejectPending={undefined}
                />
              ))}
              {streamingSectionId && (
                <p className="mt-4 flex items-center gap-2 text-[12px] text-[var(--ds-muted)]">
                  <Loader2 className="size-3 animate-spin" />
                  Regenerating section…
                </p>
              )}
            </div>
          </div>
        </main>

        {/* Side panel: permanent on lg+, sliding drawer on phones. */}
        <aside
          aria-label="Evidence panel"
          className={
            "flex min-h-0 flex-col overflow-hidden border-l border-[var(--ds-line)] bg-[var(--ds-surface)] " +
            (showRail
              ? "fixed inset-y-0 right-0 z-40 w-[min(420px,92vw)] shadow-[var(--ds-shadow-l)] lg:static lg:w-auto lg:shadow-none"
              : "hidden lg:flex")
          }
        >
          <div className="flex h-[52px] shrink-0 items-center gap-2 border-b border-[var(--ds-line-2)] px-3">
            <PillTabs
              className="mt-0"
              activeTab={railTab}
              onTabChange={(id) => setRailTab(id as RailTab)}
              tabs={[
                { id: "evidence", label: "Evidence", count: draft.evidence?.length ?? 0 },
                ...(requiredBadge ? [{ id: "required", label: `Required ${requiredBadge}` }] : []),
                { id: "sections", label: "Sections" },
              ]}
            />
            <button
              type="button"
              onClick={() => setShowRail(false)}
              aria-label="Close panel"
              className="ml-auto grid size-8 place-items-center rounded-[var(--ds-r-s)] text-[var(--ds-muted)] hover:bg-[var(--ds-surface-2)] lg:hidden"
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
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
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

        {/* Mobile scrim — fades over the canvas when the drawer is open. */}
        <button
          type="button"
          className={
            "lg:hidden fixed inset-0 z-30 bg-[var(--ds-ink)]/30 transition-opacity duration-300 motion-reduce:transition-none " +
            (showRail ? "opacity-100" : "opacity-0 pointer-events-none")
          }
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
