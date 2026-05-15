import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  PanelLeft,
  PanelRight,
  Paperclip,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { EvidenceItem, Section } from "@/lib/letters/types";
import { useDraftStore } from "@/lib/store";
import { buildExpectedEvidenceStatus } from "@/lib/evidence";
import { WizardSidebar } from "@/components/editor/WizardSidebar";
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

/**
 * Evidence step — wizard's middle stop on the employee track.
 *
 * Layout deliberately mirrors the Edit page so users don't feel a visual
 * flinch crossing from Edit → Evidence:
 *
 *   - Header bar mirrors the Editor's compact 48px header (back button,
 *     title, next CTA).
 *   - Left rail: WizardSidebar with Sections + Required tabs (unchanged).
 *   - Center: stacked SectionEditor cards — same component as the Edit
 *     page, so prose styling, toolbar, and editing affordances are
 *     identical. A banner above explains this is Evidence linking mode.
 *   - Right rail: EvidencePanel — replaces the AI panel from Edit. Search,
 *     kind filters, evidence cards, inline edit, and an Add-new form.
 *
 * The previous bespoke "Selected section" + "Add evidence" layout is gone;
 * everything that used to live in those panels now lives in EvidencePanel.
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

  const [showSidebar, setShowSidebar] = useState(false);
  const [showRail, setShowRail] = useState(false);

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

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Mirrors the Editor's compact 48px header so the wizard chrome
       * doesn't shift when crossing Edit → Evidence. Brand mark + back
       * to letters on the left; centred title; next CTA on the right. */}
      <header className="h-12 shrink-0 border-b border-[var(--ds-line)] bg-[var(--ds-surface)] sticky top-0 z-30 flex items-center gap-3 px-3 sm:px-4">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => nav(`/editor/${draft.id}`)}
          aria-label="Back to letter"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex items-center gap-2 min-w-0">
          <Paperclip className="size-4 text-[var(--ds-muted)] shrink-0" />
          <h1 className="m-0 truncate text-[13px] font-semibold text-[var(--ds-ink)]">
            Evidence & Attachments
          </h1>
          <span className="hidden md:inline text-[12px] text-[var(--ds-muted)] truncate">
            ·{" "}
            {draft.employee.legalName || draft.employer.legalName || "Draft"}
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Mobile rail toggles — mirror the Editor's mobile pattern. */}
          <Button
            variant="ghost"
            size="icon-sm"
            className="lg:hidden"
            onClick={() => setShowSidebar((current) => !current)}
            aria-label="Toggle sections rail"
            title="Sections"
          >
            <PanelLeft className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="lg:hidden"
            onClick={() => setShowRail((current) => !current)}
            aria-label="Toggle evidence rail"
            title="Evidence"
          >
            <PanelRight className="size-4" />
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to={`/editor/${draft.id}`}>
              <span className="hidden sm:inline">Back to letter</span>
              <ArrowLeft className="size-4 sm:hidden" />
            </Link>
          </Button>
          <Button
            size="sm"
            onClick={() => nav(`/editor/${draft.id}/review`)}
            aria-label="Next: Review"
            className="px-2 sm:px-3"
          >
            <span className="hidden sm:inline">Review</span>
            <ArrowRight className="size-4 sm:ml-1.5" />
          </Button>
        </div>
      </header>

      {/* One-line notice strip — appears after a Reference / Quote insert.
       * Click to dismiss. Same styling as the previous EvidenceStep. */}
      {notice && (
        <button
          type="button"
          onClick={() => setNotice(null)}
          className="flex shrink-0 items-center justify-center gap-2 border-b border-[var(--ds-line)] bg-[var(--ds-green-bg)] px-4 py-1.5 text-[12px] text-[var(--ds-green-fg)] hover:brightness-95 transition"
        >
          <CheckCircle2 className="size-3.5" />
          {notice}
        </button>
      )}

      {/* Three-column shell — same proportions as Editor.tsx so the visual
       * grid is identical. Below lg both rails become drawers (mobile
       * pattern unchanged from the previous EvidenceStep). */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)_360px] min-h-0 relative overflow-hidden">
        {/* Left rail — Sections + Required tabs. Identical to the previous
         * EvidenceStep's left rail (which already matched Edit). */}
        <aside
          className={
            "border-r border-[var(--ds-line)] bg-[var(--ds-surface)] min-h-0 flex flex-col overflow-hidden " +
            (showSidebar
              ? "absolute inset-y-0 left-0 z-40 w-[280px] shadow-xl lg:static lg:shadow-none lg:w-auto"
              : "hidden lg:flex")
          }
        >
          <WizardSidebar
            draft={draft}
            current="evidence"
            activeSectionId={activeSectionId}
            onSelectSection={(id) => {
              setActiveSectionId(id);
              setShowSidebar(false);
              const el = document.querySelector(`[data-section-id="${id}"]`);
              el?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            secondaryTabLabel="Required"
            secondaryTabBadge={(() => {
              const status = buildExpectedEvidenceStatus(draft);
              if (status.length === 0) return undefined;
              const ok = status.filter((row) => row.ok).length;
              return `${ok}/${status.length}`;
            })()}
            secondaryTab={
              <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
                <EvidenceRequirementsList draft={draft} />
              </div>
            }
          />
        </aside>

        {/* Center column — the letter view. Same stacked SectionEditor
         * cards Edit uses. EditableTitleBar + InlineDisclaimer +
         * DeadlineBanner at the top, then sections. A small banner just
         * below the title reminds the user this is Evidence linking mode. */}
        <main className="flex flex-col bg-[var(--ds-canvas)] min-w-0 min-h-0 relative">
          <div className="flex-1 overflow-auto min-h-0">
            <div className="mx-auto max-w-3xl py-6 sm:py-8 px-3 sm:px-6 space-y-3">
              <EditableTitleBar draft={draft} />
              <InlineDisclaimer draft={draft} />
              <DeadlineBanner draft={draft} />

              {/* Mode banner — telegraphs that the right rail isn't the AI
               * agent here, it's evidence. Identical visual weight to the
               * InlineDisclaimer it sits beneath, so the page doesn't get
               * top-heavy. */}
              <div className="rounded-md border border-[var(--ds-line)] bg-[var(--ds-amber-bg)]/40 px-3 py-2 text-[11.5px] leading-relaxed text-[var(--ds-amber-fg)] flex items-start gap-2">
                <Paperclip className="size-3.5 mt-0.5 shrink-0" />
                <span>
                  <strong className="font-semibold">Evidence linking mode.</strong>{" "}
                  Click any section to make it the active target, then use the
                  Evidence panel on the right to add items, link them, or insert
                  references / quotes at the cursor.
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
                <p className="text-xs text-muted-foreground flex items-center gap-2 mt-4">
                  <Loader2 className="size-3 animate-spin" />
                  Regenerating section…
                </p>
              )}
            </div>
          </div>
        </main>

        {/* Right rail — Evidence management. Replaces the AI agent panel
         * from Edit. Permanent on lg:+, sliding drawer on mobile. */}
        <aside
          className={
            "border-l border-[var(--ds-line)] bg-[var(--ds-surface)] min-h-0 flex flex-col overflow-hidden " +
            (showRail
              ? "fixed inset-y-0 right-0 z-40 w-[min(420px,90vw)] shadow-[-12px_0_32px_rgba(0,0,0,0.18)] lg:static lg:shadow-none lg:w-auto"
              : "hidden lg:flex")
          }
        >
          <EvidencePanel
            draft={draft}
            activeSectionId={activeSectionId}
            onChangeEvidence={onChangeEvidence}
            onInsertAtSection={onInsertAtSection}
            autoOpenAdd={autoOpenAdd}
          />
        </aside>

        {/* Mobile scrim — fades over the canvas when either rail is open
         * on small viewports. Mirrors the Editor's pattern. */}
        <button
          type="button"
          className={
            "lg:hidden fixed inset-0 z-30 bg-black/30 transition-opacity duration-300 motion-reduce:transition-none " +
            (showSidebar || showRail
              ? "opacity-100"
              : "opacity-0 pointer-events-none")
          }
          aria-label="Close panel"
          aria-hidden={!(showSidebar || showRail) || undefined}
          tabIndex={!(showSidebar || showRail) ? -1 : undefined}
          onClick={() => {
            setShowSidebar(false);
            setShowRail(false);
          }}
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
