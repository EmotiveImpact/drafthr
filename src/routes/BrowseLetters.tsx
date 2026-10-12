import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, Plus, Search, Sparkles, UserRound, X } from "lucide-react";
import { PageHeader } from "@/components/ds";
import {
  LETTER_CATEGORIES,
  letterCatalogByMode,
  type LetterTypeMeta,
  type LetterCategoryId,
} from "@/lib/letters/catalog";
import { hasTemplate } from "@/lib/letters/templates";
import { buildExpectedEvidenceStatus } from "@/lib/evidence";
import type { LetterTypeId, Mode, Jurisdiction } from "@/lib/letters/types";
import { useDraftStore } from "@/lib/store";
import { useProfileStore, prefillsFromProfile } from "@/lib/profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MyTemplatesGrid } from "@/components/templates/MyTemplatesGrid";
import { NewTemplateModal } from "@/components/templates/NewTemplateModal";
import { PaperThumb, Pill } from "@/components/finalize/Plan";
import { tintForCategory, tintStyle } from "@/components/templates/tints";
import { cn } from "@/lib/utils";

/**
 * Template library (design 2A + 6B). Serif title, one row of pill tabs
 * (All, each category, My templates), search and a UK / US filter, then
 * pastel preview cards with risk, jurisdiction and counsel tags.
 *
 * Notes for future maintainers:
 *  - Categories live in src/lib/letters/catalog.ts (LETTER_CATEGORIES +
 *    CATEGORY_OF map). Add new templates → add a CATEGORY_OF entry.
 *  - Per-jurisdiction template content lives in
 *    src/lib/letters/templates/{employer,employee}/<letter>.ts as
 *    LETTER_UK + LETTER_US exports. Updates can be made per jurisdiction
 *    without touching the other.
 */
type View = "all" | LetterCategoryId | "mine";

export function BrowseLetters({ mode }: { mode: Mode }) {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const [q, setQ] = useState("");
  const [view, setView] = useState<View>(() =>
    searchParams.get("tab") === "mine" ? "mine" : "all"
  );
  const [creating, setCreating] = useState(false);
  const createDraft = useDraftStore((s) => s.createDraft);
  // Surface a count on the My templates tab without a second selector.
  const customCount = useDraftStore(
    (s) => Object.values(s.customTemplates).filter((t) => t.mode === mode).length
  );
  const profile = useProfileStore((s) => s.profile);
  const [jurisdiction, setJurisdiction] = useState<Jurisdiction>(profile.defaults.jurisdiction);

  const startFromTemplate = (letterType: LetterTypeId) => {
    const answers = prefillsFromProfile(profile, mode);
    const id = createDraft(letterType, answers, mode);
    nav(`/editor/${id}`);
  };

  const catalog = useMemo(() => letterCatalogByMode(mode), [mode]);
  const activeCategory: LetterCategoryId | "all" = view === "mine" ? "all" : view;

  const inJurisdiction = (l: LetterTypeMeta) =>
    !(l.jurisdictionScope === "uk_only" && jurisdiction !== "UK") &&
    !(l.jurisdictionScope === "us_only" && jurisdiction !== "US");

  // Filter by jurisdiction scope, search query, category.
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return catalog.filter((l) => {
      if (!inJurisdiction(l)) return false;
      if (activeCategory !== "all" && l.category !== activeCategory) return false;
      if (!t) return true;
      return (
        l.title.toLowerCase().includes(t) ||
        l.shortTitle.toLowerCase().includes(t) ||
        l.description.toLowerCase().includes(t)
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, q, activeCategory, jurisdiction]);

  // Count per category for the tab counts.
  const countByCategory = useMemo(() => {
    const map = new Map<string, number>();
    catalog.forEach((l) => {
      if (!inJurisdiction(l)) return;
      const key = l.category ?? "other";
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, jurisdiction]);
  const totalCount = Array.from(countByCategory.values()).reduce((a, b) => a + b, 0);

  // Group filtered letters by category for display.
  const byCategory = useMemo(() => {
    const map = new Map<string, LetterTypeMeta[]>();
    filtered.forEach((l) => {
      const key = l.category ?? "other";
      const arr = map.get(key) ?? [];
      arr.push(l);
      map.set(key, arr);
    });
    return map;
  }, [filtered]);

  const prefix = mode === "employer" ? "/hr" : "/me";
  const hasProfileDefaults = Boolean(profile.personal.legalName || profile.employer.legalName);

  const tabs = [
    { id: "all", label: "All", count: totalCount },
    ...LETTER_CATEGORIES.filter((c) => (countByCategory.get(c.id) ?? 0) > 0).map((c) => ({
      id: c.id,
      label: c.label,
      count: countByCategory.get(c.id),
    })),
    { id: "mine", label: "My templates", count: customCount },
  ];

  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-8 sm:py-10">
      <PageHeader
        crumbs={[
          { label: mode === "employer" ? "HR team" : "Employee", href: prefix },
          { label: "New letter" },
        ]}
        title="Template library"
        lede={
          mode === "employer"
            ? "Letters for the full HR lifecycle: hiring, performance, departure and immigration, with UK and US legal language built in and kept current per jurisdiction."
            : "Letters for employees defending or asserting rights: grievances, resignations, accommodation, whistleblowing and tribunal cover, with UK and US rights-preservation language built in."
        }
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" />
            Create a template
          </Button>
        }
        tabs={tabs}
        activeTab={view}
        onTabChange={(id) => setView(id as View)}
      />

      {view === "mine" ? (
        <MyTemplatesGrid mode={mode} onCreate={() => setCreating(true)} />
      ) : (
        <>
          {/* Search + UK / US filter. Sticky so it stays reachable while
           * scrolling long category lists. */}
          <div className="sticky top-0 z-20 -mx-4 mb-6 bg-[var(--ds-surface)] px-4 py-3 sm:-mx-8 sm:px-8">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[200px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[var(--ds-muted)]" />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search templates by title or description"
                  className="h-9 pl-8 pr-8"
                />
                {q && (
                  <button
                    type="button"
                    onClick={() => setQ("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--ds-muted)] hover:text-[var(--ds-ink)]"
                    aria-label="Clear search"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>

              {/* Jurisdiction filter pill */}
              <div
                role="group"
                aria-label="Jurisdiction"
                className="inline-flex h-9 items-center gap-0.5 rounded-[var(--ds-r-m)] bg-[var(--ds-chip)] p-[3px]"
              >
                {(["UK", "US"] as const).map((j) => (
                  <button
                    key={j}
                    type="button"
                    aria-pressed={jurisdiction === j}
                    onClick={() => setJurisdiction(j)}
                    className={cn(
                      "h-full rounded-[7px] px-3 text-[13px] font-medium transition",
                      jurisdiction === j
                        ? "bg-[var(--ds-surface)] text-[var(--ds-ink)] shadow-[var(--ds-shadow-s),0_0_0_1px_var(--ds-line)]"
                        : "text-[var(--ds-muted)] hover:text-[var(--ds-ink)]"
                    )}
                  >
                    {j === "UK" ? "United Kingdom" : "United States"}
                  </button>
                ))}
              </div>
            </div>
            {hasProfileDefaults && (
              <p className="m-0 mt-2 flex items-center gap-1.5 text-[12px] text-[var(--ds-muted)]">
                <UserRound className="size-3" />
                Start drafting pre-fills from your profile defaults.
              </p>
            )}
          </div>

          <div className="space-y-10">
            {[...LETTER_CATEGORIES, { id: "other", label: "Other", description: "" }].map((cat) => {
              const letters = byCategory.get(cat.id) ?? [];
              if (letters.length === 0) return null;
              return (
                <section key={cat.id} aria-labelledby={`cat-${cat.id}`}>
                  {activeCategory === "all" && (
                    <header className="mb-3.5">
                      <h2 id={`cat-${cat.id}`} className="m-0 text-[15px] font-medium text-[var(--ds-ink)]">
                        {cat.label}
                      </h2>
                      <p className="m-0 mt-0.5 text-[12.5px] text-[var(--ds-muted)]">
                        {cat.description ? `${cat.description} ` : ""}
                        {letters.length} template{letters.length === 1 ? "" : "s"}
                      </p>
                    </header>
                  )}
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {letters.map((l) => (
                      <TemplateCard
                        key={l.id}
                        letter={l}
                        jurisdiction={jurisdiction}
                        onStart={() => startFromTemplate(l.id)}
                        onWizard={() => nav(`${prefix}/new/${l.id}`)}
                      />
                    ))}
                  </div>
                </section>
              );
            })}

            {filtered.length === 0 && (
              <div className="rounded-[var(--ds-r-l)] bg-[var(--ds-surface-2)] p-10 text-center">
                <p className="m-0 text-[14px] text-[var(--ds-muted)]">
                  No templates match {q ? `"${q}"` : "this filter"}.
                </p>
                {(q || activeCategory !== "all") && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => {
                      setQ("");
                      setView("all");
                    }}
                  >
                    Clear filters
                  </Button>
                )}
              </div>
            )}
          </div>
        </>
      )}

      <NewTemplateModal open={creating} onOpenChange={setCreating} mode={mode} />
    </div>
  );
}

/* ============================================================================
 * Sub-components
 * ==========================================================================*/

const RISK: Record<string, { tone: "green" | "amber" | "red"; label: string }> = {
  low: { tone: "green", label: "Low risk" },
  medium: { tone: "amber", label: "Medium risk" },
  high: { tone: "red", label: "High risk" },
};

/** 6B pastel preview card for a built-in letter type. */
function TemplateCard({
  letter,
  jurisdiction,
  onStart,
  onWizard,
}: {
  letter: LetterTypeMeta;
  jurisdiction: Jurisdiction;
  onStart: () => void;
  onWizard: () => void;
}) {
  const templateReady = hasTemplate(letter.id, jurisdiction);
  const risk = RISK[letter.riskClass];
  const tint = tintForCategory(letter.category);
  const category = LETTER_CATEGORIES.find((c) => c.id === letter.category);

  // Build expected evidence count by spinning up a dummy draft —
  // expectedEvidence lives on the LetterTemplate; we surface a "needs
  // chronology + 3 more" hint here.
  const expectedCount = (() => {
    const fakeDraft = {
      letterType: letter.id,
      context: { jurisdiction },
      evidence: [],
      sections: [],
    } as unknown as Parameters<typeof buildExpectedEvidenceStatus>[0];
    try {
      return buildExpectedEvidenceStatus(fakeDraft).length;
    } catch {
      return 0;
    }
  })();

  const jurisdictionPills =
    letter.jurisdictionScope === "uk_only"
      ? ["UK only"]
      : letter.jurisdictionScope === "us_only"
        ? ["US only"]
        : ["UK", "US"];

  return (
    <article
      style={tintStyle(tint)}
      className="group/card flex min-w-0 flex-col overflow-hidden rounded-[var(--ds-r-l)] border border-[var(--ds-line)] bg-[var(--ds-surface)] transition duration-200 hover:-translate-y-px hover:border-[var(--ds-line-strong)] hover:shadow-[var(--ds-shadow-m)]"
    >
      <button
        type="button"
        onClick={onWizard}
        aria-label={`Use the wizard for ${letter.title}`}
        tabIndex={-1}
        className="mx-1.5 mt-1.5 block cursor-pointer"
      >
        <PaperThumb tint={tint} height={120} />
      </button>

      <div className="flex flex-1 flex-col px-4 pb-4 pt-3.5">
        <h3 className="m-0 truncate text-[14px] font-medium text-[var(--ds-ink)]" title={letter.title}>
          {letter.title}
        </h3>
        <p className="m-0 mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-[var(--ds-muted)]">
          {letter.description}
        </p>

        {letter.badge && (
          <p className="m-0 mt-2 text-[12px] font-medium text-[var(--ds-amber-fg)]">{letter.badge}</p>
        )}

        <p className="m-0 mt-2.5 text-[12px] text-[var(--ds-muted)]">
          {letter.defaultSections.length} sections, {letter.wordRange[0]}–{letter.wordRange[1]} words
          {expectedCount > 0 && (
            <span title="Number of evidence types this template expects">
              , needs {expectedCount} evidence
            </span>
          )}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-1">
          {category && <Pill tone="tint">{category.label}</Pill>}
          {jurisdictionPills.map((j) => (
            <Pill key={j}>{j}</Pill>
          ))}
          <Pill tone={risk.tone}>{risk.label}</Pill>
          {letter.legalReviewRequired && (
            <Pill tone="amber" title="Counsel review required before export">
              Counsel review
            </Pill>
          )}
        </div>

        <div className="mt-auto flex items-center gap-2 pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={onWizard}
            className="flex-1 text-[12.5px]"
            title="Step through the wizard to capture every detail"
          >
            Use wizard
          </Button>
          <Button
            size="sm"
            onClick={onStart}
            disabled={!templateReady}
            className="flex-1 text-[12.5px]"
            title={
              templateReady
                ? `Skip the wizard: use your profile defaults and start drafting on the ${jurisdiction} template now`
                : `Template not yet available for ${jurisdiction}`
            }
          >
            <Sparkles className="size-3.5" />
            Start drafting
            <ArrowRight className="size-3.5" />
          </Button>
        </div>
      </div>
    </article>
  );
}
