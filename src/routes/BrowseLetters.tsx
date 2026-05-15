import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
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

/**
 * Template library. Categorised grid of every letter type with risk
 * chips, jurisdiction filter, full-text search, and quick-start buttons.
 *
 * Notes for future maintainers:
 *  - Categories live in src/lib/letters/catalog.ts (LETTER_CATEGORIES +
 *    CATEGORY_OF map). Add new templates → add a CATEGORY_OF entry.
 *  - Per-jurisdiction template content lives in
 *    src/lib/letters/templates/{employer,employee}/<letter>.ts as
 *    LETTER_UK + LETTER_US exports. Updates can be made per jurisdiction
 *    without touching the other.
 */
type TemplatesTab = "drafthr" | "mine";

export function BrowseLetters({ mode }: { mode: Mode }) {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [activeCategory, setActiveCategory] = useState<LetterCategoryId | "all">("all");
  const [activeTab, setActiveTab] = useState<TemplatesTab>("drafthr");
  const createDraft = useDraftStore((s) => s.createDraft);
  // Surface a count on the My Templates tab without a second selector.
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

  // Filter by jurisdiction scope, search query, category.
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return catalog.filter((l) => {
      if (l.jurisdictionScope === "uk_only" && jurisdiction !== "UK") return false;
      if (l.jurisdictionScope === "us_only" && jurisdiction !== "US") return false;
      if (activeCategory !== "all" && l.category !== activeCategory) return false;
      if (!t) return true;
      return (
        l.title.toLowerCase().includes(t) ||
        l.shortTitle.toLowerCase().includes(t) ||
        l.description.toLowerCase().includes(t)
      );
    });
  }, [catalog, q, activeCategory, jurisdiction]);

  // Count per category so badges show "12" etc.
  const countByCategory = useMemo(() => {
    const map = new Map<string, number>();
    catalog.forEach((l) => {
      if (l.jurisdictionScope === "uk_only" && jurisdiction !== "UK") return;
      if (l.jurisdictionScope === "us_only" && jurisdiction !== "US") return;
      const key = l.category ?? "other";
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    return map;
  }, [catalog, jurisdiction]);

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

  return (
    <div className="max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        crumbs={[
          { label: mode === "employer" ? "HR / Management" : "Employee", href: prefix },
          { label: "New letter" },
        ]}
        title="Template library"
        lede={
          mode === "employer"
            ? "Letter templates for the full HR lifecycle — hiring, performance, departure, immigration. UK + US legal language baked in. Updates land per jurisdiction so the law-of-the-land stays current."
            : "Letter templates for employees defending or asserting rights — grievances, resignations, accommodation, whistleblowing, tribunal cover. UK + US rights-preservation language baked in."
        }
        closeTo={prefix}
      />

      {/* Tab strip — DraftHR (built-in) vs My Templates (custom). Sits
       * between the page header and the filter bar. */}
      <div
        role="tablist"
        aria-label="Template source"
        className="flex items-center gap-1 border-b border-[var(--ds-line)] mb-4"
      >
        <TabButton
          active={activeTab === "drafthr"}
          onClick={() => setActiveTab("drafthr")}
          label="DraftHR"
        />
        <TabButton
          active={activeTab === "mine"}
          onClick={() => setActiveTab("mine")}
          label="My Templates"
          count={customCount}
        />
      </div>

      {activeTab === "mine" ? (
        <MyTemplatesGrid mode={mode} />
      ) : (
        <BuiltInBrowser
          q={q}
          setQ={setQ}
          jurisdiction={jurisdiction}
          setJurisdiction={setJurisdiction}
          activeCategory={activeCategory}
          setActiveCategory={setActiveCategory}
          filtered={filtered}
          countByCategory={countByCategory}
          byCategory={byCategory}
          profile={profile}
          startFromTemplate={startFromTemplate}
          nav={nav}
          prefix={prefix}
        />
      )}
    </div>
  );
}

function BuiltInBrowser({
  q,
  setQ,
  jurisdiction,
  setJurisdiction,
  activeCategory,
  setActiveCategory,
  filtered,
  countByCategory,
  byCategory,
  profile,
  startFromTemplate,
  nav,
  prefix,
}: {
  q: string;
  setQ: (s: string) => void;
  jurisdiction: Jurisdiction;
  setJurisdiction: (j: Jurisdiction) => void;
  activeCategory: LetterCategoryId | "all";
  setActiveCategory: (c: LetterCategoryId | "all") => void;
  filtered: LetterTypeMeta[];
  countByCategory: Map<string, number>;
  byCategory: Map<string, LetterTypeMeta[]>;
  profile: ReturnType<typeof useProfileStore.getState>["profile"];
  startFromTemplate: (id: LetterTypeId) => void;
  nav: ReturnType<typeof useNavigate>;
  prefix: string;
}) {
  return (
    <>
      {/* Filter bar: search + jurisdiction toggle. Sticky so it stays
       * visible as the user scrolls through long category lists. */}
      <div className="sticky top-0 z-20 bg-[var(--ds-canvas)] py-3 mb-4 -mx-4 px-4 sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--ds-muted)] pointer-events-none" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search templates by title or description…"
              className="pl-8 pr-8 h-9"
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

          {/* Jurisdiction toggle */}
          <div className="inline-flex rounded-md border border-[var(--ds-line)] overflow-hidden h-9">
            {(["UK", "US"] as const).map((j) => (
              <button
                key={j}
                type="button"
                onClick={() => setJurisdiction(j)}
                className={
                  "px-3 text-[12px] font-medium transition " +
                  (jurisdiction === j
                    ? "bg-[var(--ds-ink)] text-white"
                    : "bg-[var(--ds-surface)] text-[var(--ds-body)] hover:bg-[var(--ds-line-2)]")
                }
              >
                {j === "UK" ? "🇬🇧 UK" : "🇺🇸 US"}
              </button>
            ))}
          </div>
        </div>

        {/* Category chips */}
        <div className="flex flex-wrap items-center gap-1.5 mt-3">
          <CategoryChip
            label="All"
            count={filtered.length}
            active={activeCategory === "all"}
            onClick={() => setActiveCategory("all")}
          />
          {LETTER_CATEGORIES.map((cat) => {
            const n = countByCategory.get(cat.id) ?? 0;
            if (n === 0) return null;
            return (
              <CategoryChip
                key={cat.id}
                label={cat.label}
                count={n}
                active={activeCategory === cat.id}
                onClick={() => setActiveCategory(cat.id)}
              />
            );
          })}
        </div>
      </div>

      {/* Category sections */}
      <div className="space-y-8">
        {LETTER_CATEGORIES.map((cat) => {
          const letters = byCategory.get(cat.id) ?? [];
          if (letters.length === 0) return null;
          if (activeCategory !== "all" && activeCategory !== cat.id) return null;

          return (
            <section key={cat.id}>
              <header className="mb-3">
                <h2 className="text-[16px] font-semibold text-[var(--ds-ink)] m-0">
                  {cat.label}
                </h2>
                <p className="text-[12.5px] text-[var(--ds-muted)] mt-0.5 m-0">
                  {cat.description} · {letters.length} template{letters.length === 1 ? "" : "s"}
                </p>
              </header>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {letters.map((l) => (
                  <TemplateCard
                    key={l.id}
                    letter={l}
                    jurisdiction={jurisdiction}
                    profile={profile}
                    onStart={() => startFromTemplate(l.id)}
                    onWizard={() => nav(`${prefix}/new/${l.id}`)}
                  />
                ))}
              </div>
            </section>
          );
        })}

        {/* "Other" — letter types without a category (shouldn't be any
         * after the catalog map; defensive). */}
        {byCategory.get("other") && (byCategory.get("other")?.length ?? 0) > 0 && (
          <section>
            <h2 className="text-[16px] font-semibold text-[var(--ds-ink)] m-0 mb-3">Other</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {(byCategory.get("other") ?? []).map((l) => (
                <TemplateCard
                  key={l.id}
                  letter={l}
                  jurisdiction={jurisdiction}
                  profile={profile}
                  onStart={() => startFromTemplate(l.id)}
                  onWizard={() => nav(`${prefix}/new/${l.id}`)}
                />
              ))}
            </div>
          </section>
        )}

        {filtered.length === 0 && (
          <div className="rounded-lg border border-[var(--ds-line)] bg-[var(--ds-surface)] p-8 text-center">
            <p className="text-[14px] text-[var(--ds-muted)] m-0">
              No templates match {q ? `"${q}"` : "this filter"}.
            </p>
            {(q || activeCategory !== "all") && (
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => {
                  setQ("");
                  setActiveCategory("all");
                }}
              >
                Clear filters
              </Button>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function TabButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={
        "relative inline-flex items-center gap-2 px-3 h-9 text-[13px] font-medium transition border-b-2 -mb-px " +
        (active
          ? "border-[var(--ds-ink)] text-[var(--ds-ink)]"
          : "border-transparent text-[var(--ds-muted)] hover:text-[var(--ds-body)]")
      }
    >
      {label}
      {typeof count === "number" && count > 0 && (
        <span
          className={
            "tabular-nums text-[10.5px] font-semibold rounded-full px-1.5 py-0.5 min-w-[18px] text-center " +
            (active
              ? "bg-[var(--ds-ink)] text-white"
              : "bg-[var(--ds-line-2)] text-[var(--ds-muted)]")
          }
        >
          {count}
        </span>
      )}
    </button>
  );
}

/* ============================================================================
 * Sub-components
 * ==========================================================================*/

function CategoryChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "inline-flex items-center gap-1.5 text-[11.5px] px-2.5 h-7 rounded-full border transition " +
        (active
          ? "bg-[var(--ds-ink)] text-white border-[var(--ds-ink)]"
          : "bg-[var(--ds-surface)] text-[var(--ds-body)] border-[var(--ds-line)] hover:bg-[var(--ds-line-2)]")
      }
    >
      <span className="font-medium">{label}</span>
      <span
        className={
          "tabular-nums " + (active ? "opacity-70" : "text-[var(--ds-muted)]")
        }
      >
        {count}
      </span>
    </button>
  );
}

const RISK_TONE: Record<string, { bg: string; fg: string; label: string }> = {
  low: {
    bg: "bg-[var(--ds-green-bg)]",
    fg: "text-[var(--ds-green-fg)]",
    label: "Low risk",
  },
  medium: {
    bg: "bg-[var(--ds-amber-bg)]",
    fg: "text-[var(--ds-amber-fg)]",
    label: "Medium risk",
  },
  high: {
    bg: "bg-[var(--ds-red-bg)]",
    fg: "text-[var(--ds-red-fg)]",
    label: "High risk",
  },
};

function TemplateCard({
  letter,
  jurisdiction,
  profile,
  onStart,
  onWizard,
}: {
  letter: LetterTypeMeta;
  jurisdiction: Jurisdiction;
  profile: ReturnType<typeof useProfileStore.getState>["profile"];
  onStart: () => void;
  onWizard: () => void;
}) {
  const templateReady = hasTemplate(letter.id, jurisdiction);
  const risk = RISK_TONE[letter.riskClass];

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

  return (
    <article
      className="group relative flex flex-col rounded-lg border border-[var(--ds-line)] bg-[var(--ds-surface)] hover:border-[var(--ds-subtle)] hover:shadow-sm transition overflow-hidden"
    >
      {/* Top row: risk chip + jurisdiction availability */}
      <div className="flex items-center justify-between gap-2 px-4 pt-4">
        <span
          className={
            "inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.06em] px-2 py-0.5 rounded-full " +
            risk.bg +
            " " +
            risk.fg
          }
        >
          {letter.riskClass === "high" ? (
            <ShieldAlert className="size-3" />
          ) : letter.riskClass === "low" ? (
            <ShieldCheck className="size-3" />
          ) : (
            <ShieldCheck className="size-3" />
          )}
          {risk.label}
        </span>

        <div className="flex items-center gap-1">
          {letter.jurisdictionScope === "uk_only" && (
            <span className="text-[10px] text-[var(--ds-muted)] font-medium">UK only</span>
          )}
          {letter.jurisdictionScope === "us_only" && (
            <span className="text-[10px] text-[var(--ds-muted)] font-medium">US only</span>
          )}
          {letter.legalReviewRequired && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--ds-amber-bg)] text-[var(--ds-amber-fg)] font-medium"
              title="Counsel review required before export"
            >
              ⚠ Counsel
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="px-4 pt-3 pb-4 flex-1 flex flex-col">
        <h3 className="text-[15px] font-semibold text-[var(--ds-ink)] m-0 leading-tight">
          {letter.title}
        </h3>
        <p className="text-[12.5px] text-[var(--ds-body)] mt-1.5 leading-relaxed m-0 line-clamp-3">
          {letter.description}
        </p>

        {letter.badge && (
          <p className="text-[11px] text-[var(--ds-amber-fg)] font-medium mt-2 m-0">
            ⚠ {letter.badge}
          </p>
        )}

        {/* Footer-row: word range + expected evidence + sections count */}
        <div className="flex items-center gap-3 mt-3 text-[10.5px] text-[var(--ds-muted)] flex-wrap">
          <span>
            {letter.wordRange[0]}–{letter.wordRange[1]} words
          </span>
          <span>·</span>
          <span>{letter.defaultSections.length} sections</span>
          {expectedCount > 0 && (
            <>
              <span>·</span>
              <span title="Number of evidence types this template expects">
                Needs {expectedCount} evidence
              </span>
            </>
          )}
        </div>
      </div>

      {/* Action row */}
      <div className="flex items-center gap-2 px-4 pb-4 pt-1 mt-auto">
        <Button
          variant="outline"
          size="sm"
          onClick={onWizard}
          className="flex-1 text-[12px]"
          title="Step through the wizard to capture every detail"
        >
          Use wizard
        </Button>
        <Button
          size="sm"
          onClick={onStart}
          disabled={!templateReady}
          className="flex-1 text-[12px]"
          title={
            templateReady
              ? `Skip the wizard — use your profile defaults and start drafting on the ${jurisdiction} template now`
              : `Template not yet available for ${jurisdiction}`
          }
        >
          <Sparkles className="size-3" />
          Start drafting
          <ArrowRight className="size-3" />
        </Button>
      </div>

      {/* Profile-prefill hint — small footer when the user has set
       * defaults so they know clicking Start uses them. */}
      {(profile.personal.legalName || profile.employer.legalName) && (
        <div className="px-4 py-1.5 text-[10px] text-[var(--ds-muted)] border-t border-[var(--ds-line-2)] bg-[var(--ds-surface-2)]/50">
          Will pre-fill from your profile defaults.
        </div>
      )}
    </article>
  );
}
