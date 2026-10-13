import { useMemo, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowUpDown,
  ChevronDown,
  Coins,
  DoorOpen,
  FileText,
  Gavel,
  Handshake,
  HeartPulse,
  Landmark,
  ListFilter,
  MessagesSquare,
  Plus,
  Scale,
  Search,
  Sparkles,
  Upload,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { Pill } from "@/components/ds";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MyTemplatesGrid } from "@/components/templates/MyTemplatesGrid";
import { NewTemplateModal } from "@/components/templates/NewTemplateModal";
import { UploadTemplateModal } from "@/components/templates/UploadTemplateModal";
import { PaperArt } from "@/components/templates/PaperArt";
import { tintForCategory } from "@/components/templates/tints";
import { Band, SlidingTabs } from "@/components/wizard/Band";
import { Segmented, plainLabel, useWorkspaceName } from "@/components/wizard/kit";

/**
 * Templates (design/hifi/out/templates.png). Mist band with the counts in
 * the lede, Upload and Create actions and underline tabs (All, each real
 * category, Your templates); a tool row with search, UK / US / Both, Risk,
 * Counsel review and sort; then the built-in letter cards and the firm's own
 * templates.
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
type JurisdictionFilter = Jurisdiction | "Both";
type RiskFilter = "any" | "low" | "medium" | "high";
type CounselFilter = "any" | "yes" | "no";
type SortKey = "used" | "az";

const CATEGORY_ICON: Record<string, LucideIcon> = {
  onboarding: Handshake,
  performance_conduct: Gavel,
  departure: DoorOpen,
  leave: HeartPulse,
  compensation: Coins,
  dispute: MessagesSquare,
  tribunal_legal: Landmark,
};

const RISK_LABEL: Record<Exclude<RiskFilter, "any">, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

const COUNSEL_LABEL: Record<CounselFilter, string> = {
  any: "Any",
  yes: "Needs counsel review",
  no: "No counsel review",
};

const SORT_LABEL: Record<SortKey, string> = { used: "Most used", az: "A to Z" };

function isView(v: string | null, catalogIds: Set<string>): v is View {
  return v === "all" || v === "mine" || (v !== null && catalogIds.has(v));
}

export function BrowseLetters({ mode }: { mode: Mode }) {
  const nav = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const profile = useProfileStore((s) => s.profile);
  const workspace = useWorkspaceName();
  const createDraft = useDraftStore((s) => s.createDraft);
  const drafts = useDraftStore((s) => s.drafts);
  const customCount = useDraftStore(
    (s) => Object.values(s.customTemplates).filter((t) => t.mode === mode).length
  );

  const categoryIds = useMemo(() => new Set<string>(LETTER_CATEGORIES.map((c) => c.id)), []);
  const tabParam = searchParams.get("tab");
  const view: View = isView(tabParam, categoryIds) ? tabParam : "all";
  const setView = (next: View) => {
    const params = new URLSearchParams(searchParams);
    if (next === "all") params.delete("tab");
    else params.set("tab", next);
    setSearchParams(params, { replace: true });
  };

  const [q, setQ] = useState("");
  const [juris, setJuris] = useState<JurisdictionFilter>(profile.defaults.jurisdiction);
  const [risk, setRisk] = useState<RiskFilter>("any");
  const [counsel, setCounsel] = useState<CounselFilter>("any");
  const [sort, setSort] = useState<SortKey>("used");
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);

  /** The template Start drafting uses: the chosen one, or the profile's with Both. */
  const startJurisdiction: Jurisdiction = juris === "Both" ? profile.defaults.jurisdiction : juris;

  const startFromTemplate = (letterType: LetterTypeId) => {
    const answers = { ...prefillsFromProfile(profile, mode), jurisdiction: startJurisdiction };
    const id = createDraft(letterType, answers, mode);
    nav(`/editor/${id}`);
  };

  const catalog = useMemo(() => letterCatalogByMode(mode), [mode]);

  const inJurisdiction = (l: LetterTypeMeta) =>
    juris === "Both" ||
    !(
      (l.jurisdictionScope === "uk_only" && juris !== "UK") ||
      (l.jurisdictionScope === "us_only" && juris !== "US")
    );

  // Real usage in this workspace: letters of each type (template authoring
  // drafts do not count).
  const usage = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of Object.values(drafts)) {
      if (d.isTemplateSource || d.mode !== mode) continue;
      map.set(d.letterType, (map.get(d.letterType) ?? 0) + 1);
    }
    return map;
  }, [drafts, mode]);

  const inScope = useMemo(
    () => catalog.filter(inJurisdiction),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [catalog, juris]
  );

  const countByCategory = useMemo(() => {
    const map = new Map<string, number>();
    inScope.forEach((l) => {
      const key = l.category ?? "other";
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    return map;
  }, [inScope]);

  const activeCategory: LetterCategoryId | "all" = view === "mine" ? "all" : view;
  const query = q.trim().toLowerCase();
  const filtersOn = query !== "" || risk !== "any" || counsel !== "any";

  const shown = useMemo(() => {
    const list = inScope.filter((l) => {
      if (activeCategory !== "all" && l.category !== activeCategory) return false;
      if (risk !== "any" && l.riskClass !== risk) return false;
      if (counsel === "yes" && !l.legalReviewRequired) return false;
      if (counsel === "no" && l.legalReviewRequired) return false;
      if (!query) return true;
      return (
        l.title.toLowerCase().includes(query) ||
        l.shortTitle.toLowerCase().includes(query) ||
        l.description.toLowerCase().includes(query)
      );
    });
    return list.sort((a, b) => {
      if (sort === "used") {
        const d = (usage.get(b.id) ?? 0) - (usage.get(a.id) ?? 0);
        if (d !== 0) return d;
      }
      return a.title.localeCompare(b.title, "en-GB");
    });
  }, [inScope, activeCategory, risk, counsel, query, sort, usage]);

  const clearFilters = () => {
    setQ("");
    setRisk("any");
    setCounsel("any");
    setView("all");
  };

  const prefix = mode === "employer" ? "/hr" : "/me";
  const hasProfileDefaults = Boolean(profile.personal.legalName || profile.employer.legalName);
  const category = LETTER_CATEGORIES.find((c) => c.id === activeCategory);

  const tabs = [
    { id: "all", label: "All", count: inScope.length },
    ...LETTER_CATEGORIES.filter((c) => (countByCategory.get(c.id) ?? 0) > 0).map((c) => ({
      id: c.id,
      label: plainLabel(c.label),
      count: countByCategory.get(c.id),
    })),
    { id: "mine", label: "Your templates", count: customCount },
  ];

  const firmSub =
    mode === "employer"
      ? `Saved by your team from letters you have sent. Only ${workspace ?? "your workspace"} can see them.`
      : "Saved from your own letters. Only you can see them.";

  const lede = (
    <>
      <b>
        {inScope.length} {inScope.length === 1 ? "letter" : "letters"}
      </b>{" "}
      {mode === "employer"
        ? "shaped by UK and US employment law"
        : "written to protect your rights under UK and US employment law"}
      {customCount > 0 ? (
        <>
          , and <b>{customCount}</b> of your own.
        </>
      ) : (
        "."
      )}
    </>
  );

  return (
    <div className="w-full min-w-0 px-4 pb-16 pt-6 sm:px-8 lg:px-12 lg:pt-[34px]">
      <Band
        crumbs={[{ label: workspace ?? (mode === "employer" ? "HR team" : "Your letters"), href: prefix }, { label: "Library" }]}
        title="Templates"
        lede={lede}
        actions={
          <>
            <Button variant="outline" onClick={() => setUploading(true)} className="flex-1 sm:flex-none">
              <Upload className="size-4" />
              Upload template
            </Button>
            <Button onClick={() => setCreating(true)} className="flex-1 sm:flex-none">
              <Plus className="size-4" />
              Create a template
            </Button>
          </>
        }
        bottom={<SlidingTabs label="Template categories" tabs={tabs} active={view} onChange={(id) => setView(id as View)} />}
      />

      {view === "mine" ? (
        <section aria-labelledby="mine-head" className="mt-6">
          <SectionHead
            id="mine-head"
            title="Your templates"
            sub={firmSub}
          />
          <MyTemplatesGrid mode={mode} onCreate={() => setCreating(true)} variant="mine" />
        </section>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative w-full sm:w-[340px]">
              <Search
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--ds-subtle)]"
              />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search templates, for example probation"
                aria-label="Search templates"
                className={`h-[38px] w-full rounded-[10px] ${q ? "pr-9" : "pr-3"} border border-[var(--ds-line)] bg-[var(--ds-surface)] pl-9 text-[14px] text-[var(--ds-ink)] outline-none transition-colors duration-[120ms] placeholder:text-[var(--ds-subtle)] hover:border-[var(--ds-line-strong)] focus-visible:border-[var(--ds-ink)] focus-visible:shadow-[var(--ds-focus-ring)] [&::-webkit-search-cancel-button]:appearance-none`}
              />
              {q && (
                <button
                  type="button"
                  onClick={() => setQ("")}
                  className="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-[6px] text-[var(--ds-subtle)] transition-colors duration-[120ms] hover:bg-[var(--ds-surface-2)] hover:text-[var(--ds-ink)]"
                  aria-label="Clear search"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>

            <Segmented<JurisdictionFilter>
              label="Jurisdiction"
              value={juris}
              onChange={setJuris}
              options={[
                { value: "UK", label: "UK" },
                { value: "US", label: "US" },
                { value: "Both", label: "Both" },
              ]}
            />

            <FilterMenu
              icon={ListFilter}
              label="Risk"
              valueLabel={risk === "any" ? "Any" : RISK_LABEL[risk]}
              value={risk}
              onChange={(v) => setRisk(v as RiskFilter)}
              heading="Risk level"
              options={[
                { value: "any", label: "Any" },
                { value: "low", label: "Low" },
                { value: "medium", label: "Medium" },
                { value: "high", label: "High" },
              ]}
            />

            <FilterMenu
              icon={Scale}
              label="Counsel review"
              valueLabel={counsel === "any" ? undefined : counsel === "yes" ? "Needed" : "Not needed"}
              value={counsel}
              onChange={(v) => setCounsel(v as CounselFilter)}
              heading="Counsel review"
              options={(["any", "yes", "no"] as const).map((v) => ({ value: v, label: COUNSEL_LABEL[v] }))}
            />

            <span className="hidden flex-1 sm:block" />

            <FilterMenu
              icon={ArrowUpDown}
              label={SORT_LABEL[sort]}
              value={sort}
              onChange={(v) => setSort(v as SortKey)}
              heading="Sort by"
              align="end"
              options={(["used", "az"] as const).map((v) => ({ value: v, label: SORT_LABEL[v] }))}
              ariaLabel={`Sort: ${SORT_LABEL[sort]}`}
            />
          </div>

          {hasProfileDefaults && (
            <p className="m-0 mt-2.5 flex items-center gap-1.5 text-[12.5px] text-[var(--ds-subtle)]">
              <UserRound aria-hidden className="size-3.5" />
              Start drafting fills in your profile details.
            </p>
          )}

          <section aria-labelledby="builtin-head" className="mt-6">
            <SectionHead
              id="builtin-head"
              title={category ? plainLabel(category.label) : "All templates"}
              sub={
                category
                  ? plainLabel(category.description)
                  : "Written to the ACAS Codes and checked by employment solicitors"
              }
              right={
                (filtersOn || activeCategory !== "all") && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="rounded-[4px] text-[14px] text-[var(--ds-ink)] hover:underline hover:underline-offset-2"
                  >
                    View all {catalog.filter(inJurisdiction).length}
                  </button>
                )
              }
            />

            {shown.length === 0 ? (
              <div className="flex flex-col items-center rounded-[16px] bg-[var(--ds-surface-2)] px-6 py-10 text-center">
                <p className="m-0 text-[14px] text-[var(--ds-muted)]">
                  {query ? `No templates match "${q.trim()}".` : "No templates match these filters."}
                </p>
                <Button variant="outline" size="sm" className="mt-3" onClick={clearFilters}>
                  Clear filters
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
                {shown.map((l) => (
                  <TemplateCard
                    key={l.id}
                    letter={l}
                    jurisdiction={startJurisdiction}
                    used={usage.get(l.id) ?? 0}
                    onStart={() => startFromTemplate(l.id)}
                    onWizard={() => nav(`${prefix}/new/${l.id}`)}
                  />
                ))}
              </div>
            )}
          </section>

          {view === "all" && (
            <section aria-labelledby="firm-head" className="mt-[26px]">
              <SectionHead
                id="firm-head"
                title={mode === "employer" ? "Your firm's templates" : "Your saved templates"}
                sub={firmSub}
                right={
                  <button
                    type="button"
                    onClick={() => setView("mine")}
                    className="rounded-[4px] text-[14px] text-[var(--ds-ink)] hover:underline hover:underline-offset-2"
                  >
                    Manage
                  </button>
                }
              />
              <MyTemplatesGrid mode={mode} onCreate={() => setCreating(true)} variant="all" />
            </section>
          )}
        </>
      )}

      <NewTemplateModal open={creating} onOpenChange={setCreating} mode={mode} />
      <UploadTemplateModal open={uploading} onOpenChange={setUploading} mode={mode} onSaved={() => setView("mine")} />
    </div>
  );
}

/* ============================================================================
 * Sub-components
 * ==========================================================================*/

function SectionHead({
  id,
  title,
  sub,
  right,
}: {
  id: string;
  title: string;
  sub?: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-3.5 flex items-end justify-between gap-4">
      <div className="min-w-0">
        <h2 id={id} className="m-0 text-[15.5px] font-medium text-[var(--ds-ink)]">
          {title}
        </h2>
        {sub && <p className="m-0 mt-[3px] text-[13.5px] text-[var(--ds-muted)]">{sub}</p>}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

/** A tool-row filter button that opens a kit menu of choices. */
function FilterMenu({
  icon: Icon,
  label,
  valueLabel,
  value,
  onChange,
  options,
  heading,
  align = "start",
  ariaLabel,
}: {
  icon: LucideIcon;
  label: string;
  valueLabel?: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  heading: string;
  align?: "start" | "end";
  ariaLabel?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel ?? (valueLabel ? `${label}: ${valueLabel}` : label)}
          className="inline-flex h-[38px] items-center gap-[7px] whitespace-nowrap rounded-[10px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-3 text-[13.5px] text-[var(--ds-body)] transition-colors duration-[120ms] hover:border-[var(--ds-line-strong)] hover:bg-[var(--ds-hover)] focus-visible:shadow-[var(--ds-focus-ring)] focus-visible:outline-none data-[state=open]:bg-[var(--ds-surface-2)]"
        >
          <Icon aria-hidden className="size-[15px] text-[var(--ds-subtle)]" />
          {label}
          {valueLabel && <b className="font-medium text-[var(--ds-ink)]">{valueLabel}</b>}
          <ChevronDown aria-hidden className="size-3.5 text-[var(--ds-subtle)]" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="min-w-[200px]">
        <DropdownMenuLabel>{heading}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          {options.map((o) => (
            <DropdownMenuRadioItem key={o.value} value={o.value}>
              {o.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const RISK: Record<string, { tone: "green" | "amber" | "red"; label: string }> = {
  low: { tone: "green", label: "Low risk" },
  medium: { tone: "amber", label: "Medium risk" },
  high: { tone: "red", label: "High risk" },
};

/** Built-in letter card: paper art on top, kind and risk, title,
 * description, evidence and tags, then Use wizard and Start drafting. */
function TemplateCard({
  letter,
  jurisdiction,
  used,
  onStart,
  onWizard,
}: {
  letter: LetterTypeMeta;
  jurisdiction: Jurisdiction;
  used: number;
  onStart: () => void;
  onWizard: () => void;
}) {
  const templateReady = hasTemplate(letter.id, jurisdiction);
  const risk = RISK[letter.riskClass];
  const tint = tintForCategory(letter.category);
  const category = LETTER_CATEGORIES.find((c) => c.id === letter.category);
  const KindIcon = (letter.category && CATEGORY_ICON[letter.category]) || FileText;

  // Number of evidence types this template expects, from a stand-in draft.
  const expectedCount = useMemo(() => {
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
  }, [letter.id, jurisdiction]);

  const jurisdictionTags =
    letter.jurisdictionScope === "uk_only"
      ? ["UK only"]
      : letter.jurisdictionScope === "us_only"
        ? ["US only"]
        : ["UK", "US"];

  const facts = `${letter.defaultSections.length} sections, ${letter.wordRange[0]} to ${letter.wordRange[1]} words`;

  return (
    <article
      data-testid="template-card"
      className="flex min-w-0 flex-col rounded-[16px] border border-[var(--ds-line)] bg-[var(--ds-surface)] p-1.5 transition-colors duration-[120ms] hover:border-[var(--ds-line-strong)]"
    >
      <button
        type="button"
        onClick={onWizard}
        aria-label={`Use the wizard for ${letter.title}`}
        tabIndex={-1}
        className="block cursor-pointer rounded-[11px]"
      >
        <PaperArt tint={tint} height={112} />
      </button>

      <div className="flex flex-1 flex-col px-2 pb-1.5 pt-3">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <span className="inline-flex min-w-0 items-center gap-1.5 text-[12.5px] text-[var(--ds-muted)]">
            <KindIcon aria-hidden className="size-3.5 shrink-0 text-[var(--ds-subtle)]" />
            <span className="truncate">{category ? plainLabel(category.label) : "Other"}</span>
          </span>
          <Pill tone={risk.tone} className="shrink-0">
            {risk.label}
          </Pill>
        </div>

        <h3
          className="m-0 mt-2.5 truncate text-[14.5px] font-medium text-[var(--ds-ink)]"
          title={`${plainLabel(letter.title)} (${facts})`}
        >
          {plainLabel(letter.title)}
        </h3>
        <p className="m-0 mt-[3px] line-clamp-2 text-[13px] leading-[1.4] text-[var(--ds-muted)]">
          {plainLabel(letter.description)}
        </p>
        {letter.badge && (
          <p className="m-0 mt-1.5 truncate text-[12px] font-medium text-[var(--ds-amber-fg)]" title={plainLabel(letter.badge)}>
            {plainLabel(letter.badge)}
          </p>
        )}

        <div className="mt-auto flex min-w-0 items-center gap-1.5 whitespace-nowrap pt-3 text-[12.5px] text-[var(--ds-subtle)]">
          <span title={`${facts}${used > 0 ? `. Used for ${used} ${used === 1 ? "letter" : "letters"} here` : ""}`}>
            {expectedCount > 0 ? `${expectedCount} evidence` : `${letter.defaultSections.length} sections`}
          </span>
          <span className="flex-1" />
          {letter.legalReviewRequired && (
            <span
              title="Counsel review required before export"
              className="inline-flex items-center gap-1 rounded-[6px] bg-[var(--ds-blue-bg)] px-[7px] py-0.5 text-[11.5px] font-medium text-[var(--ds-blue-fg)]"
            >
              <Scale aria-hidden className="size-[11px]" />
              Counsel
            </span>
          )}
          <span className="flex gap-1">
            {jurisdictionTags.map((j) => (
              <span
                key={j}
                className="rounded-[5px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-1.5 py-px text-[11px] font-medium tracking-[0.01em] text-[var(--ds-muted)]"
              >
                {j}
              </span>
            ))}
          </span>
        </div>

        <div className="mt-3.5 flex min-w-0 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onWizard}
            className="h-[34px] min-w-0 flex-auto px-2.5 text-[13.5px]"
            title="Step through the questions to capture every detail"
          >
            Use wizard
          </Button>
          <span
            className="flex min-w-0 flex-auto"
            title={templateReady ? undefined : `Template not yet available for ${jurisdiction}`}
          >
            <Button
              size="sm"
              onClick={onStart}
              disabled={!templateReady}
              className="h-[34px] min-w-0 flex-auto px-2.5 text-[13.5px]"
              title={
                templateReady
                  ? `Skip the questions: use your profile details and start drafting on the ${jurisdiction} template now`
                  : `Template not yet available for ${jurisdiction}`
              }
            >
              <Sparkles className="size-3.5" />
              Start drafting
            </Button>
          </span>
        </div>
      </div>
    </article>
  );
}

