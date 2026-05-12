import { useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  PlusCircle,
  FileText,
  Mail,
  ShieldAlert,
  ShieldCheck,
  Scale,
  FileWarning,
  FileSearch,
  ScrollText,
  Sparkles,
  CalendarClock,
  ArrowRight,
  AlertCircle,
} from "lucide-react";
import type { LetterTypeId, Mode } from "@/lib/letters/types";
import { useDraftStore } from "@/lib/store";
import { useProfileStore } from "@/lib/profile";
import { letterCatalogByMode, getLetterMeta } from "@/lib/letters/catalog";
import { briefTitleFor } from "@/lib/letters/display";
import { daysUntilDateOnly, formatDateOnly } from "@/lib/date-only";

/* ============================================================================
 * Home — the landing dashboard.
 *
 * Layout (matches /home-v2-mockup.html):
 *
 *   ┌ breadcrumb
 *   │
 *   ├ HERO ─ eyebrow · serif H1 (greeting + italic accent) · lede · two CTAs
 *   │       Decorative giant "D" watermark in the top-right corner.
 *   │
 *   ├ CATALOG ─ 3×2 grid of flagship letter types as tactile tiles. This is
 *   │           the page's real workhorse — the place a user goes to start.
 *   │
 *   ├ CONTINUE + UPCOMING ─ a quiet two-column row. Rendered only when there
 *   │                       are drafts or deadlines to surface (no
 *   │                       "0 / 0 / 0 / 0" graveyard for new users).
 *   │
 *   └ TRUST FOOTER ─ four legal-coverage chips + "not legal advice".
 *
 * Previous home had a four-up stat row, Matters cards, AutoGroup rows, and a
 * buried "Quick start" section. Those moved to /matters or are gone — the
 * home now exists to start a letter, resume one in progress, or eyeball
 * what's due next.
 * ==========================================================================*/

export function Home({ mode }: { mode: Mode }) {
  const nav = useNavigate();
  const drafts = useDraftStore((s) => s.drafts);
  const profile = useProfileStore((s) => s.profile);

  const myDrafts = useMemo(
    () =>
      Object.values(drafts)
        .filter((d) => d.mode === mode)
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [drafts, mode]
  );

  const deadlines = useMemo(() => deriveDeadlines(myDrafts), [myDrafts]);

  const catalog = letterCatalogByMode(mode);
  const flagship = catalog.filter((l) => l.flagshipV1);

  const prefix = mode === "employer" ? "/hr" : "/me";
  const name =
    profile.personal.preferredName ||
    profile.personal.legalName?.split(/\s+/)[0] ||
    "";
  const greeting = name ? `Hello, ${name}.` : "Welcome back.";

  const today = useMemo(
    () =>
      new Date().toLocaleDateString(undefined, {
        weekday: "long",
        day: "numeric",
        month: "long",
      }),
    []
  );

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      {/* Breadcrumb */}
      <div className="text-[12px] text-[var(--ds-muted)] mb-3.5 flex items-center gap-1.5">
        <span>{mode === "employer" ? "HR / Management" : "Employee workspace"}</span>
        <span className="opacity-40">/</span>
        <span className="text-[var(--ds-ink)] font-medium">Home</span>
      </div>

      <Hero greeting={greeting} today={today} prefix={prefix} catalogCount={catalog.length} />

      <Catalog tiles={flagship.slice(0, 5)} prefix={prefix} hasMore={flagship.length > 5} />

      {(myDrafts.length > 0 || deadlines.length > 0) && (
        <ContinueAndDeadlines
          drafts={myDrafts.slice(0, 3)}
          deadlines={deadlines}
          onOpenDraft={(id) => nav(`/editor/${id}`)}
          onOpenNew={() => nav(`${prefix}/new`)}
        />
      )}

      <TrustFooter />
    </div>
  );
}

/* ─── Hero ─────────────────────────────────────────────────────────────── */

function Hero({
  greeting,
  today,
  prefix,
  catalogCount,
}: {
  greeting: string;
  today: string;
  prefix: string;
  catalogCount: number;
}) {
  return (
    <section
      className="relative overflow-hidden rounded-2xl border border-[var(--ds-line)] mb-7 px-7 sm:px-14 py-12 sm:py-14"
      style={{
        background:
          "radial-gradient(80% 60% at 88% -10%, rgba(10,11,13,0.05), transparent 70%), linear-gradient(180deg,#fff 0%,#fbfbfc 100%)",
      }}
    >
      {/* Decorative DraftHR "D" watermark — the real logo at low opacity,
       * positioned bottom-right so it bleeds off the hero corner. */}
      <img
        src="/drafthr-d-mark.png"
        alt=""
        aria-hidden
        className="pointer-events-none absolute select-none hidden sm:block"
        style={{
          right: -50,
          bottom: -60,
          width: 340,
          height: 340,
          opacity: 0.08,
          objectFit: "contain",
        }}
      />

      <div
        className="relative z-[1] text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ds-muted)] mb-3.5 inline-flex items-center gap-2"
      >
        <span className="inline-block w-[18px] h-px bg-[var(--ds-subtle)]" />
        {today}
      </div>

      <h1
        className="m-0 mb-1.5 text-[var(--ds-ink)] font-semibold"
        style={{
          fontSize: "clamp(32px, 5vw, 44px)",
          lineHeight: 1.1,
          letterSpacing: "-0.02em",
          maxWidth: "22ch",
        }}
      >
        {greeting}
        <br />
        <span className="font-medium text-[var(--ds-body)]">Let's put it in writing.</span>
      </h1>

      <p
        className="text-[var(--ds-body)] leading-relaxed mt-4 mb-7"
        style={{ fontSize: "15.5px", maxWidth: "58ch" }}
      >
        Wizard-guided HR letters with UK and US legal awareness — grievance, resignation,
        settlement, flexible working, and more.{" "}
        <span className="font-semibold text-[var(--ds-ink)]">Defensible by default.</span>
      </p>

      <div className="flex items-center gap-2.5 flex-wrap relative z-[1]">
        <Link
          to={`${prefix}/new`}
          className="inline-flex items-center gap-2 px-[18px] py-[11px] rounded-[9px] bg-[var(--ds-ink)] text-white font-semibold text-[14px] shadow-sm hover:-translate-y-px hover:shadow-md transition"
        >
          <PlusCircle className="size-4" />
          New letter
        </Link>
        <Link
          to={`${prefix}/new`}
          className="inline-flex items-center gap-2 px-[18px] py-[11px] rounded-[9px] bg-transparent text-[var(--ds-ink)] font-semibold text-[14px] border border-[var(--ds-line)] hover:bg-white hover:border-[var(--ds-subtle)] transition"
        >
          Browse all {catalogCount} letter types
          <ArrowRight className="size-3.5 opacity-70" />
        </Link>
      </div>
    </section>
  );
}

/* ─── Letter catalog ───────────────────────────────────────────────────── */

function Catalog({
  tiles,
  prefix,
  hasMore,
}: {
  tiles: ReturnType<typeof letterCatalogByMode>;
  prefix: string;
  hasMore: boolean;
}) {
  return (
    <>
      <div className="flex items-baseline justify-between mt-2 mb-4.5">
        <h2 className="m-0 text-[var(--ds-ink)] text-[18px] font-semibold tracking-[-0.01em]">
          Start a letter
        </h2>
        <Link
          to={`${prefix}/new`}
          className="text-[12.5px] text-[var(--ds-muted)] font-medium hover:text-[var(--ds-ink)] transition"
        >
          See all letter types →
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 mb-9">
        {tiles.map((l) => {
          const Icon = iconForLetter(l.id);
          const tone = toneForLetter(l.id, l.riskClass);
          return (
            <Link
              key={l.id}
              to={`${prefix}/new/${l.id}`}
              className="group relative flex flex-col gap-2.5 p-5 rounded-[12px] bg-[var(--ds-surface)] border border-[var(--ds-line)] hover:border-[var(--ds-ink)] hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-10px_rgba(0,0,0,0.12)] transition min-h-[148px]"
            >
              <div
                className="size-9 rounded-[9px] grid place-items-center"
                style={{ background: tone.bg, color: tone.fg }}
              >
                <Icon className="size-[18px]" />
              </div>
              <h3 className="m-0 text-[15px] font-semibold text-[var(--ds-ink)] leading-tight">
                {l.shortTitle}
              </h3>
              <p className="m-0 text-[12.5px] leading-[1.5] text-[var(--ds-muted)] line-clamp-2">
                {l.description}
              </p>
              <span className="absolute bottom-3.5 right-4.5 text-[11.5px] font-semibold text-[var(--ds-ink)] opacity-0 group-hover:opacity-100 transition">
                Start →
              </span>
            </Link>
          );
        })}

        {hasMore && (
          <Link
            to={`${prefix}/new`}
            className="flex items-center justify-center text-center rounded-[12px] border border-dashed border-[var(--ds-line)] bg-transparent text-[var(--ds-muted)] hover:text-[var(--ds-ink)] hover:border-[var(--ds-ink)] transition min-h-[148px] p-5"
          >
            <h3 className="m-0 text-[14px] font-semibold">More letter types →</h3>
          </Link>
        )}
      </div>
    </>
  );
}

/* ─── Continue + Upcoming ──────────────────────────────────────────────── */

function ContinueAndDeadlines({
  drafts,
  deadlines,
  onOpenDraft,
  onOpenNew,
}: {
  drafts: ReturnType<typeof useDraftStore.getState>["drafts"][string][];
  deadlines: ReturnType<typeof deriveDeadlines>;
  onOpenDraft: (id: string) => void;
  onOpenNew: () => void;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-4 mb-9">
      {/* Continue where you left off */}
      <section className="bg-[var(--ds-surface)] border border-[var(--ds-line)] rounded-[12px] overflow-hidden">
        <header className="flex items-center justify-between px-[18px] py-3.5 border-b border-[var(--ds-line-2)]">
          <h3 className="m-0 text-[14px] font-semibold text-[var(--ds-ink)]">
            Continue where you left off
          </h3>
          {drafts.length > 0 ? (
            <span className="text-[11px] text-[var(--ds-muted)] font-semibold tracking-wide bg-[var(--ds-surface-2)] px-2 py-0.5 rounded-full">
              {drafts.length} draft{drafts.length === 1 ? "" : "s"}
            </span>
          ) : null}
        </header>
        {drafts.length === 0 ? (
          <div className="px-[18px] py-8 text-center">
            <FileText className="size-5 mx-auto mb-2 text-[var(--ds-subtle)]" />
            <p className="text-[13px] text-[var(--ds-body)] m-0 mb-1 font-medium">No drafts yet</p>
            <p className="text-[12px] text-[var(--ds-muted)] m-0">
              Pick a letter type above to begin.
            </p>
          </div>
        ) : (
          drafts.map((d) => {
            const status = draftStatus(d);
            const statusBg =
              status === "drafting"
                ? "var(--ds-amber-fg)"
                : status === "ready"
                ? "var(--ds-green-fg)"
                : "var(--ds-subtle)";
            return (
              <button
                key={d.id}
                onClick={() => onOpenDraft(d.id)}
                className="w-full text-left flex items-center gap-3 px-[18px] py-3 border-b border-[var(--ds-line-2)] last:border-b-0 hover:bg-[var(--ds-surface-2)] transition"
              >
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: statusBg }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-[var(--ds-ink)] truncate">
                    {briefTitleFor(d)}
                  </div>
                  <div className="text-[11.5px] text-[var(--ds-muted)]">
                    {statusLabel(status, d.sections.length)}
                  </div>
                </div>
                <span className="text-[11px] text-[var(--ds-subtle)] shrink-0 tabular-nums">
                  {timeAgo(d.updatedAt)}
                </span>
              </button>
            );
          })
        )}
      </section>

      {/* Upcoming deadlines */}
      <section className="bg-[var(--ds-surface)] border border-[var(--ds-line)] rounded-[12px] overflow-hidden">
        <header className="flex items-center justify-between px-[18px] py-3.5 border-b border-[var(--ds-line-2)]">
          <h3 className="m-0 text-[14px] font-semibold text-[var(--ds-ink)] inline-flex items-center gap-2">
            <CalendarClock className="size-3.5 text-[var(--ds-subtle)]" />
            Upcoming
          </h3>
          {deadlines.length > 0 && (
            <span className="text-[11px] text-[var(--ds-muted)] font-semibold tracking-wide bg-[var(--ds-surface-2)] px-2 py-0.5 rounded-full">
              {deadlines.length} deadline{deadlines.length === 1 ? "" : "s"}
            </span>
          )}
        </header>
        {deadlines.length === 0 ? (
          <div className="px-[18px] py-8 text-center">
            <CalendarClock className="size-5 mx-auto mb-2 text-[var(--ds-subtle)]" />
            <p className="text-[12px] text-[var(--ds-muted)] m-0 leading-relaxed">
              Deadlines appear here when you start a tribunal-bound letter.
            </p>
            <button
              onClick={onOpenNew}
              className="mt-2 text-[12px] font-medium text-[var(--ds-ink)] hover:underline"
            >
              Start one →
            </button>
          </div>
        ) : (
          deadlines.map((d) => {
            const urgent = d.daysAway >= 0 && d.daysAway < 14;
            const passed = d.daysAway < 0;
            return (
              <div
                key={d.id}
                className="flex items-center gap-2.5 px-[18px] py-3 border-b border-[var(--ds-line-2)] last:border-b-0"
              >
                <div className="w-9 text-center font-mono shrink-0">
                  <div
                    className="text-[18px] font-semibold leading-none"
                    style={{
                      color: passed
                        ? "var(--ds-red-fg)"
                        : urgent
                        ? "var(--ds-amber-fg)"
                        : "var(--ds-ink)",
                    }}
                  >
                    {passed ? "—" : d.daysAway}
                  </div>
                  <div className="text-[9px] uppercase tracking-wider text-[var(--ds-muted)] mt-0.5">
                    {passed ? "passed" : "days"}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[12.5px] font-semibold text-[var(--ds-ink)] truncate">
                    {d.label}
                  </div>
                  <div className="text-[11px] text-[var(--ds-muted)]">{formatDate(d.iso)}</div>
                </div>
                {urgent && <AlertCircle className="size-3.5 text-[var(--ds-amber-fg)] shrink-0" />}
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}

/* ─── Trust footer ─────────────────────────────────────────────────────── */

function TrustFooter() {
  const chips = [
    "UK Employment Rights Act 1996",
    "ACAS Code aware",
    "US FLSA & state-law variants",
    "Private — drafts never train models",
  ];
  return (
    <section className="bg-[var(--ds-surface-2)] border border-[var(--ds-line)] rounded-[12px] px-5 sm:px-7 py-4 sm:py-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
      <div className="flex flex-wrap gap-2">
        {chips.map((c) => (
          <span
            key={c}
            className="inline-flex items-center gap-1.5 text-[11.5px] text-[var(--ds-body)] font-medium bg-white px-2.5 py-1 rounded-full border border-[var(--ds-line)]"
          >
            <span className="text-[var(--ds-green-fg)] font-bold">✓</span> {c}
          </span>
        ))}
      </div>
      <p className="text-[11.5px] text-[var(--ds-muted)] md:text-right md:max-w-[42ch] m-0 leading-snug">
        Not legal advice. High-stakes letters should be reviewed by qualified counsel before
        issuance.
      </p>
    </section>
  );
}

/* ============================================================================
 * Helpers
 * ==========================================================================*/

function safeMeta(id: string) {
  try {
    return getLetterMeta(id as Parameters<typeof getLetterMeta>[0]);
  } catch {
    return null;
  }
}

function deriveDeadlines(
  drafts: ReturnType<typeof useDraftStore.getState>["drafts"][string][]
) {
  return drafts
    .filter((d) => d.context.protectedDeadline)
    .map((d) => {
      const iso = d.context.protectedDeadline!.iso;
      const daysAway = daysUntilDateOnly(iso);
      return {
        id: d.id,
        label: safeMeta(d.letterType)?.shortTitle ?? d.letterType,
        iso,
        daysAway,
      };
    })
    .sort((a, b) => a.daysAway - b.daysAway)
    .slice(0, 5);
}

function draftStatus(d: {
  sections: { status: string; html: string }[];
}): "empty" | "drafting" | "ready" | "exported" {
  const all = d.sections;
  if (all.length === 0) return "empty";
  if (all.every((s) => s.status === "empty" && !s.html)) return "empty";
  if (all.every((s) => s.status === "ready")) return "ready";
  if (all.some((s) => s.status === "ready" || s.status === "edited" || s.html)) return "drafting";
  return "empty";
}

function statusLabel(status: ReturnType<typeof draftStatus>, sectionCount: number): string {
  switch (status) {
    case "ready":
      return "Ready to export";
    case "drafting":
      return `Drafting · ${sectionCount} section${sectionCount === 1 ? "" : "s"}`;
    case "exported":
      return "Exported";
    default:
      return "Not started";
  }
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

function formatDate(iso: string): string {
  return formatDateOnly(iso, { day: "numeric", month: "short", year: "numeric" });
}

/* Per-letter tile colour. Keeps the catalog tactile without screaming.
 * Falls back to riskClass mapping for letter types we haven't hand-tuned. */
function toneForLetter(id: LetterTypeId, riskClass: "low" | "medium" | "high") {
  const handTuned: Partial<Record<LetterTypeId, { bg: string; fg: string }>> = {
    grievance: { bg: "var(--ds-amber-bg)", fg: "var(--ds-amber-fg)" },
    appeal: { bg: "var(--ds-red-bg)", fg: "var(--ds-red-fg)" },
    resignation_clean: { bg: "var(--ds-blue-bg)", fg: "var(--ds-blue-fg)" },
    resignation_with_grievance: { bg: "var(--ds-blue-bg)", fg: "var(--ds-blue-fg)" },
    resignation_constructive: { bg: "var(--ds-blue-bg)", fg: "var(--ds-blue-fg)" },
    flexible_working_request: { bg: "var(--ds-violet-bg)", fg: "var(--ds-violet-fg)" },
    offer: { bg: "var(--ds-green-bg)", fg: "var(--ds-green-fg)" },
    promotion: { bg: "var(--ds-green-bg)", fg: "var(--ds-green-fg)" },
    salary_increase: { bg: "var(--ds-green-bg)", fg: "var(--ds-green-fg)" },
    settlement_cover: { bg: "var(--ds-green-bg)", fg: "var(--ds-green-fg)" },
    settlement_counter_offer: { bg: "var(--ds-green-bg)", fg: "var(--ds-green-fg)" },
    termination: { bg: "var(--ds-red-bg)", fg: "var(--ds-red-fg)" },
    warning: { bg: "var(--ds-amber-bg)", fg: "var(--ds-amber-fg)" },
    subject_access_request: { bg: "var(--ds-blue-bg)", fg: "var(--ds-blue-fg)" },
    whistleblowing: { bg: "var(--ds-red-bg)", fg: "var(--ds-red-fg)" },
    reference: { bg: "var(--ds-blue-bg)", fg: "var(--ds-blue-fg)" },
    accommodation_request: { bg: "var(--ds-violet-bg)", fg: "var(--ds-violet-fg)" },
  };
  if (handTuned[id]) return handTuned[id]!;
  if (riskClass === "high") return { bg: "var(--ds-red-bg)", fg: "var(--ds-red-fg)" };
  if (riskClass === "medium") return { bg: "var(--ds-amber-bg)", fg: "var(--ds-amber-fg)" };
  return { bg: "var(--ds-green-bg)", fg: "var(--ds-green-fg)" };
}

function iconForLetter(id: LetterTypeId) {
  switch (id) {
    case "offer":
    case "promotion":
    case "salary_increase":
      return Sparkles;
    case "termination":
    case "warning":
      return ShieldAlert;
    case "reference":
    case "probation_outcome":
    case "resignation_clean":
    case "resignation_with_grievance":
    case "resignation_constructive":
      return Mail;
    case "grievance":
      return FileWarning;
    case "appeal":
      return Scale;
    case "subject_access_request":
      return FileSearch;
    case "whistleblowing":
      return ShieldAlert;
    case "flexible_working_request":
      return CalendarClock;
    case "accommodation_request":
      return ShieldCheck;
    default:
      return ScrollText;
  }
}
