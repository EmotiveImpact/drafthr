import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { formatDistanceToNowStrict } from "date-fns";
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  CircleCheck,
  FileText,
  LibraryBig,
  Plus,
  Send,
  Users,
  X,
} from "lucide-react";
import type { Draft, Mode } from "@/lib/letters/types";
import { useDraftStore } from "@/lib/store";
import { useProfileStore } from "@/lib/profile";
import { useReviewStore } from "@/lib/journey/reviews";
import { letterCatalogByMode } from "@/lib/letters/catalog";
import { formatDateOnly } from "@/lib/date-only";
import { deriveEmployeesFromDrafts } from "@/lib/employees";
import { AssistantBox } from "@/components/home/AssistantBox";
import { StatTiles, TileFoot, weeklySeries, type StatTileProps } from "@/components/home/StatTiles";
import { TemplateCards } from "@/components/home/TemplateCards";
import { FADE_IN_GROUP, HomeGrid, ListPlaceholder, RailBox, SectionHead } from "@/components/home/HomeParts";
import { useLettersLoading } from "@/components/home/loadState";
import { Band, BAND_BTN_DARK, BAND_BTN_GHOST, HomeBand, OverviewLede } from "@/components/home/HomeBand";
import { ContinueCards, HistoryCard, NeedRow, NeedsYouCard, NeedsYouList, StatusPill } from "@/components/home/OverviewCards";
import { PageThumb, categoryName } from "@/components/home/letterArt";
import {
  firstNameOf,
  historyRows,
  journeysFor,
  letterName,
  personFor,
  realLetters,
  useHomeData,
  type LetterJourney,
} from "@/components/home/homeData";
import { extractCalendarEvents, daysLeftLabel } from "@/components/home/calendarEvents";

const BACKFILL_DISMISS_KEY = "drafthr.hr.employeeBackfillDismissed.v1";

/* ============================================================================
 * Home: the landing page for HR and employee modes (mocks home, phone-home).
 *
 *   ┌ band: breadcrumb, greeting, summary line, team, New matter, New letter,
 *   │       tabs Overview, Needs approval, Calendar, Activity (HR only)
 *   ├ main column: ask box, letters to continue, templates to start from
 *   └ rail: what needs you and your private history (HR), deadlines (employee)
 *
 * The number tiles that used to sit here are on Reports.
 * ==========================================================================*/

export function Home({ mode }: { mode: Mode }) {
  if (mode === "employer") return <HrHome />;
  return <EmployeeHome mode={mode} />;
}

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, v: string) {
  try {
    window.localStorage.setItem(key, v);
  } catch {
    // Private windows: the banner just comes back next time.
  }
}

/* ============================================================================
 * HR home, Overview tab
 * ==========================================================================*/

function HrHome() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const drafts = useDraftStore((s) => s.drafts);
  const matters = useDraftStore((s) => s.matters);
  const employees = useDraftStore((s) => s.employees);
  const createEmployee = useDraftStore((s) => s.createEmployee);
  const profile = useProfileStore((s) => s.profile);
  const data = useHomeData("employer");
  const loading = useLettersLoading();
  const me = profile.personal.preferredName || profile.personal.legalName || "";

  // Employee backfill: HR has drafts but no employee records yet.
  const [dismissed, setDismissed] = useState(() => safeGet(BACKFILL_DISMISS_KEY) === "1");
  const backfillCount = useMemo(() => {
    if (dismissed) return 0;
    if (Object.keys(employees).length > 0) return 0;
    return deriveEmployeesFromDrafts(drafts).length;
  }, [dismissed, drafts, employees]);
  const onImportEmployees = () => {
    for (const s of deriveEmployeesFromDrafts(drafts)) {
      const { draftCount: _d, lastSeenAt: _l, ...rest } = s;
      createEmployee(rest);
    }
    safeSet(BACKFILL_DISMISS_KEY, "1");
    setDismissed(true);
    nav("/employees");
  };
  const onDismissBackfill = () => {
    safeSet(BACKFILL_DISMISS_KEY, "1");
    setDismissed(true);
  };

  const recentLetters = useMemo(
    () => [...data.live].sort((a, b) => b.draft.updatedAt - a.draft.updatedAt).slice(0, 3),
    [data.live]
  );
  const history = useMemo(() => historyRows(data.journeys, me, 4), [data.journeys, me]);

  const starters = useMemo(() => {
    const j = profile.defaults.jurisdiction;
    return letterCatalogByMode("employer")
      .filter((l) => l.flagshipV1)
      .filter((l) => !(l.jurisdictionScope === "uk_only" && j !== "UK"))
      .filter((l) => !(l.jurisdictionScope === "us_only" && j !== "US"))
      .slice(0, 3);
  }, [profile.defaults.jurisdiction]);

  const showAllNeeds = params.get("view") === "needs-you";
  const lawWord = profile.defaults.jurisdiction === "US" ? "US law" : "UK law";

  const banner = backfillCount > 0 && (
    <BackfillBanner count={backfillCount} onImport={onImportEmployees} onDismiss={onDismissBackfill} />
  );

  return (
    <div className="min-w-0">
      <HomeBand
        active="overview"
        approvals={data.waiting.length}
        notice={banner || undefined}
        lede={<OverviewLede inProgress={data.summary.inProgress} needYou={data.summary.needYou} />}
      />

      {showAllNeeds ? (
        <div className="px-4 pt-6 pb-12 md:px-12 md:pt-[30px]">
          <Link
            to="/hr"
            className="mb-4 inline-flex items-center gap-1.5 rounded-[4px] text-[13.5px] text-[var(--ds-muted)] transition-colors duration-[120ms] hover:text-[var(--ds-ink)]"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            Back to Overview
          </Link>
          <SectionHead
            title="Everything that needs you"
            sub="Letters waiting for you, hearings this week, tasks due soon and matters' next steps"
          />
          <NeedsYouList items={data.needs} />
        </div>
      ) : (
        // One ask box for every width (one textarea, one label). On phones
        // (mock phone-home) the rail becomes "Needs you" and "Recent
        // letters" rows; from md up it is the cards beside the main column.
        <HomeGrid
          top={<AssistantBox mode="employer" jurisdiction={profile.defaults.jurisdiction} />}
          rail={
            <>
              <div key={loading ? "phone-loading" : "phone-ready"} className={`md:hidden [&>section:first-child]:mt-0 ${FADE_IN_GROUP}`}>
                <PhoneSection title="Needs you" to={data.needs.length > 0 ? "/hr?view=needs-you" : undefined}>
                  {loading ? (
                    <ListPlaceholder rows={3} />
                  ) : data.needs.length === 0 ? (
                    <p className="m-0 py-3 text-[13.5px] text-[var(--ds-muted)]">Nothing needs you right now.</p>
                  ) : (
                    <ul className="m-0 list-none p-0">
                      {data.needs.slice(0, 4).map((it) => (
                        <NeedRow key={it.id} item={it} phone />
                      ))}
                    </ul>
                  )}
                </PhoneSection>
                <PhoneSection title="Recent letters" to="/letters">
                  {loading ? <ListPlaceholder rows={3} /> : <RecentRows letters={recentLetters} />}
                </PhoneSection>
              </div>
              {loading ? (
                <div className="hidden min-w-0 flex-col gap-[18px] md:flex">
                  <RailBox title="Needs you">
                    <ListPlaceholder rows={2} className="pb-2" />
                  </RailBox>
                  <RailBox title="History">
                    <ListPlaceholder rows={3} thumb={false} label="Loading history" className="pb-2" />
                  </RailBox>
                </div>
              ) : (
                <div key="desk-ready" className={`hidden min-w-0 flex-col gap-[18px] md:flex ${FADE_IN_GROUP}`}>
                  <NeedsYouCard items={data.needs} startHref="/hr/new" />
                  <HistoryCard rows={history} />
                </div>
              )}
            </>
          }
          bottom={
            <div className="hidden md:block">
              <section aria-label="Continue where you left off" className="mt-[34px]">
                <SectionHead
                  title="Continue where you left off"
                  sub="Letters your team is drafting"
                  action={recentLetters.length > 0 ? { label: "View all", to: "/letters" } : undefined}
                />
                {loading ? (
                  <ListPlaceholder rows={3} />
                ) : (
                  <div className={FADE_IN_GROUP}>
                    <ContinueCards letters={recentLetters} matters={matters} startHref="/hr/new" />
                  </div>
                )}
              </section>
              <section aria-label="Start from a template" className="mt-[34px]">
                <SectionHead
                  title="Start from a template"
                  sub={`Letters your policies and ${lawWord} already shape`}
                  action={{ label: "Browse templates", to: "/hr/new" }}
                />
                <TemplateCards letters={starters} prefix="/hr" />
              </section>
            </div>
          }
        />
      )}
    </div>
  );
}

function BackfillBanner({ count, onImport, onDismiss }: { count: number; onImport: () => void; onDismiss: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-[14px] bg-[var(--ds-tint-sky)] px-4 py-3.5">
      <span
        aria-hidden
        className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-[8px] bg-[var(--ds-surface)] text-[var(--ds-tint-sky-ink)]"
      >
        <Users className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="m-0 text-[14px] font-semibold text-[var(--ds-ink)]">Build your employee directory from existing drafts</h3>
        <p className="m-0 mt-0.5 text-[13px] leading-snug text-[var(--ds-body)]">
          {count} unique {count === 1 ? "person appears" : "people appear"} across your drafts. Import them so future
          letters, matters and the Employees page link to one record per person.
        </p>
        <div className="mt-2.5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onImport}
            className="inline-flex h-8 items-center gap-1.5 rounded-[8px] bg-[var(--ds-accent)] px-3 text-[13px] font-medium text-[var(--ds-on-accent)] transition-colors duration-[120ms] hover:bg-[var(--ds-accent-hover)] active:bg-[var(--ds-accent-press)]"
          >
            Import {count} {count === 1 ? "employee" : "employees"}
            <ArrowRight className="size-3" aria-hidden />
          </button>
          <Link
            to="/employees"
            className="inline-flex items-center gap-1 rounded-[4px] text-[13px] font-medium text-[var(--ds-body)] transition-colors duration-[120ms] hover:text-[var(--ds-ink)]"
          >
            Open Employees
            <ArrowRight className="size-3 opacity-70" aria-hidden />
          </Link>
        </div>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="-m-1 grid size-7 shrink-0 place-items-center rounded-[7px] text-[var(--ds-muted)] transition-colors duration-[120ms] hover:bg-[var(--ds-surface)] hover:text-[var(--ds-ink)]"
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}

/* ─── Phone sections (mock phone-home `.ps`) ───────────────────────── */

function PhoneSection({ title, to, children }: { title: string; to?: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="mt-[26px]">
      <div className="mb-1 flex items-baseline justify-between px-0.5">
        <h2 className="ds-title m-0 text-[22px] leading-tight tracking-[-0.015em]">{title}</h2>
        {to && (
          <Link to={to} className="rounded-[4px] text-[13.5px] text-[var(--ds-ink)]">
            View all
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function RecentRows({ letters }: { letters: LetterJourney[] }) {
  if (letters.length === 0) {
    return (
      <p className="m-0 py-3 text-[13.5px] text-[var(--ds-muted)]">
        No letters yet.{" "}
        <Link to="/hr/new" className="font-medium text-[var(--ds-ink)] underline underline-offset-2">
          Start a letter
        </Link>
      </p>
    );
  }
  return (
    <ul className="m-0 list-none p-0">
      {letters.map(({ draft: d, journey: j }) => (
        <li key={d.id} className="border-b border-[var(--ds-line-2)] last:border-b-0">
          <Link to={`/editor/${d.id}`} className="flex items-center gap-3 px-0.5 py-[11px] active:bg-[var(--ds-surface-2)]">
            <PageThumb tinted={j.needsYou} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14.5px] font-medium text-[var(--ds-ink)]">{letterName(d)}</span>
              <span className="mt-[3px] block truncate text-[12.5px] text-[var(--ds-muted)]">
                {[personFor(d), categoryName(d.letterType)].filter(Boolean).join(" · ")}
              </span>
            </span>
            <StatusPill journey={j} className="shrink-0" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/* ============================================================================
 * Employee home (same language: band, ask box, letters, rail)
 * ==========================================================================*/

function EmployeeHome({ mode }: { mode: Mode }) {
  const drafts = useDraftStore((s) => s.drafts);
  const matters = useDraftStore((s) => s.matters);
  const requests = useReviewStore((s) => s.requests);
  const profile = useProfileStore((s) => s.profile);
  const name = firstNameOf(profile);
  const prefix = "/me";

  const myDrafts = useMemo(
    () => realLetters(drafts, mode).sort((a, b) => b.updatedAt - a.updatedAt),
    [drafts, mode]
  );
  const journeys = useMemo(() => journeysFor(myDrafts, requests, false), [myDrafts, requests]);
  const deadlines = useMemo(() => deriveDeadlines(myDrafts), [myDrafts]);
  const catalog = letterCatalogByMode(mode);
  const flagship = catalog.filter((l) => l.flagshipV1);
  const today = useMemo(
    () => new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }),
    []
  );
  const hasWork = myDrafts.length > 0 || deadlines.length > 0;
  const stats = useMemo(() => deriveEmployeeStats(journeys), [journeys]);
  const upcoming = deadlines.filter((d) => d.daysAway >= 0);
  const next = upcoming[0];

  const tiles: StatTileProps[] = [
    {
      label: "Letters",
      icon: FileText,
      value: myDrafts.length,
      series: stats.startedWeekly,
      sparkLabel: "Letters started each week over the last 12 weeks",
      footer: <TileFoot>{stats.startedThisMonth} started this month</TileFoot>,
    },
    {
      label: "Ready to send",
      icon: CircleCheck,
      value: stats.ready,
      footer: <TileFoot>{stats.inProgress} still in progress</TileFoot>,
    },
    {
      label: "Sent",
      icon: Send,
      value: stats.sent,
      footer: (
        <TileFoot>
          {stats.lastSentAt ? `Last sent ${formatDistanceToNowStrict(stats.lastSentAt, { addSuffix: true })}` : "None sent yet"}
        </TileFoot>
      ),
    },
    {
      label: "Deadlines coming up",
      icon: CalendarClock,
      value: upcoming.length,
      footer: next ? (
        <TileFoot pill={daysLeftLabel(next.daysAway)} tone={next.daysAway < 14 ? "red" : "grey"}>
          next one
        </TileFoot>
      ) : (
        <TileFoot>None coming up</TileFoot>
      ),
    },
  ];

  return (
    <div className="min-w-0">
      <Band
        crumbs={[{ label: "Employee" }, { label: today }]}
        title={name ? `Hello, ${name}` : "Welcome back"}
        lede={
          <>
            Let's put it in writing. Guided letters with UK and US legal awareness, for grievance, resignation,
            settlement, flexible working and more. <b>Defensible by default.</b>
          </>
        }
        actions={
          <>
            <Link to={`${prefix}/new`} className={BAND_BTN_GHOST}>
              <LibraryBig className="size-4" aria-hidden />
              Browse all {catalog.length} letter types
            </Link>
            <Link to={`${prefix}/new`} data-tour="new-letter-cta" className={BAND_BTN_DARK}>
              <Plus className="size-4" aria-hidden />
              New letter
            </Link>
          </>
        }
      />

      <HomeGrid
        top={
          <>
            <AssistantBox mode={mode} jurisdiction={profile.defaults.jurisdiction} />
            {myDrafts.length > 0 && (
              <section aria-label="Your letters at a glance" className="mt-[30px]">
                <StatTiles tiles={tiles} />
              </section>
            )}
          </>
        }
        rail={hasWork ? <DeadlinesBox deadlines={deadlines} prefix={prefix} /> : undefined}
        bottom={
          <>
            {myDrafts.length > 0 && (
              <section aria-label="Continue where you left off" className="mt-[34px]">
                <SectionHead
                  title="Continue where you left off"
                  sub={`${myDrafts.length} ${myDrafts.length === 1 ? "letter" : "letters"} in progress or sent`}
                  action={{ label: "View all", to: "/letters" }}
                />
                <ContinueCards letters={journeys.slice(0, 3)} matters={matters} startHref={`${prefix}/new`} />
              </section>
            )}
            <section aria-label="Start a letter" className="mt-[34px]">
              <SectionHead
                title="Start a letter"
                sub="The letters people need most, each with a guided wizard"
                action={{ label: "See all letter types", to: `${prefix}/new` }}
              />
              <TemplateCards
                letters={flagship.slice(0, 5)}
                prefix={prefix}
                moreHref={flagship.length > 5 ? `${prefix}/new` : undefined}
              />
            </section>
            {!hasWork && (
              <div className="mt-[34px] rounded-[16px] border border-[var(--ds-line)] px-5 py-5">
                <h2 className="ds-title m-0 text-[22px] leading-tight">Deadlines</h2>
                <p className="m-0 mt-2 text-[14px] font-medium text-[var(--ds-ink)]">No deadlines yet</p>
                <p className="m-0 mt-1 text-[13px] text-[var(--ds-muted)]">
                  Deadlines appear here when you start a tribunal-bound letter: appeals, grievances, dismissal
                  responses.
                </p>
                <Link
                  to={`${prefix}/new`}
                  className="mt-2 inline-flex items-center gap-1 rounded-[4px] text-[13px] font-medium text-[var(--ds-ink)] underline-offset-[3px] hover:underline"
                >
                  Start a letter
                  <ArrowRight className="size-3" aria-hidden />
                </Link>
              </div>
            )}
          </>
        }
      />

      <div className="px-4 pb-8 md:px-12">
        <TrustFooter />
      </div>
    </div>
  );
}

/* ─── Employee rail: deadlines ─────────────────────────────────────── */

type Deadline = ReturnType<typeof deriveDeadlines>[number];

function DeadlinesBox({ deadlines, prefix }: { deadlines: Deadline[]; prefix: string }) {
  return (
    <RailBox
      title="Deadlines"
      badge={
        deadlines.length > 0 ? (
          <span className="ml-2 inline-grid h-[18px] min-w-[19px] place-items-center rounded-[9px] bg-[var(--ds-chip)] px-[5px] text-[11.5px] font-medium text-[var(--ds-muted)]">
            {deadlines.length}
          </span>
        ) : undefined
      }
      action={deadlines.length > 0 ? { label: "View all", to: "/calendar" } : undefined}
    >
      {deadlines.length === 0 ? (
        <div className="pb-4">
          <p className="m-0 text-[14px] font-medium text-[var(--ds-ink)]">No deadlines yet</p>
          <p className="m-0 mt-1 text-[13px] text-[var(--ds-muted)]">
            Deadlines appear here when you start a tribunal-bound letter: appeals, grievances, dismissal responses.
          </p>
          <Link
            to={`${prefix}/new`}
            className="mt-2 inline-flex items-center gap-1 rounded-[4px] text-[13px] font-medium text-[var(--ds-ink)] underline-offset-[3px] hover:underline"
          >
            Start a letter
            <ArrowRight className="size-3" aria-hidden />
          </Link>
        </div>
      ) : (
        <ul className="m-0 list-none p-0 pb-1">
          {deadlines.map((d) => {
            const passed = d.daysAway < 0;
            const urgent = !passed && d.daysAway < 14;
            return (
              <li key={d.id} className="border-t border-[var(--ds-line-2)] first:border-t-0">
                <Link
                  to={d.href}
                  className="-mx-2 block rounded-[10px] px-2 py-3 transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] active:bg-[var(--ds-surface-2)]"
                >
                  <span className="flex items-center justify-between gap-3 text-[12.5px]">
                    <span className="min-w-0 truncate text-[var(--ds-muted)]">{d.label}</span>
                    <span
                      className={
                        passed || urgent ? "shrink-0 font-medium text-[var(--ds-red-fg)]" : "shrink-0 font-medium text-[var(--ds-ink)]"
                      }
                    >
                      {passed ? "Passed" : d.daysAway === 0 ? "Today" : `${d.daysAway} ${d.daysAway === 1 ? "day" : "days"} left`}
                    </span>
                  </span>
                  <span className="ds-title mt-1 block text-[22px] leading-tight">
                    {formatDateOnly(d.iso, { day: "numeric", month: "long", year: "numeric" }, "en-GB")}
                  </span>
                  {d.basis && (
                    <span className="mt-1 line-clamp-2 block text-[12.5px] leading-snug text-[var(--ds-muted)]">{d.basis}</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </RailBox>
  );
}

/* ─── Trust footer ─────────────────────────────────────────────────── */

function TrustFooter() {
  const chips = [
    "UK Employment Rights Act 1996",
    "ACAS Code aware",
    "US FLSA and state-law variants",
    "Private: drafts never train models",
  ];
  return (
    <footer className="mt-6 flex flex-col gap-3 border-t border-[var(--ds-line)] pt-5 md:flex-row md:items-center md:justify-between">
      <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1.5 p-0">
        {chips.map((c) => (
          <li key={c} className="inline-flex items-center gap-1.5 text-[12.5px] text-[var(--ds-muted)]">
            <CircleCheck className="size-3.5 text-[var(--ds-green-fg)]" aria-hidden />
            {c}
          </li>
        ))}
      </ul>
      <p className="m-0 text-[12.5px] leading-snug text-[var(--ds-muted)] md:max-w-[42ch] md:text-right">
        Not legal advice. High-stakes letters should be reviewed by qualified counsel before issuance.
      </p>
    </footer>
  );
}

/* ─── Helpers ──────────────────────────────────────────────────────── */

/** Every dated thing on the person's letters, soonest first (the rail shows five). */
function deriveDeadlines(drafts: Draft[]) {
  return extractCalendarEvents(drafts)
    .filter((e) => e.type === "tribunal" || e.type === "appeal" || e.type === "response" || e.type === "hearing")
    .map((e) => ({
      id: e.id,
      href: e.href,
      label: `${e.letter}, ${e.title.toLowerCase()}`,
      iso: e.iso,
      basis: e.citation && e.citation !== e.basis ? e.basis : e.basis,
      daysAway: e.daysAway,
    }))
    .sort((a, b) => {
      // Upcoming first (soonest), then passed (most recent).
      if ((a.daysAway < 0) !== (b.daysAway < 0)) return a.daysAway < 0 ? 1 : -1;
      return a.daysAway < 0 ? b.daysAway - a.daysAway : a.daysAway - b.daysAway;
    })
    .slice(0, 5);
}

function deriveEmployeeStats(journeys: LetterJourney[]) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  let ready = 0;
  let inProgress = 0;
  let sent = 0;
  let lastSentAt = 0;
  for (const { draft: d, journey: j } of journeys) {
    if (j.stage === "sent" || (d.exports?.length ?? 0) > 0) {
      sent += 1;
      for (const e of d.exports ?? []) lastSentAt = Math.max(lastSentAt, e.exportedAt);
      continue;
    }
    if (j.stage === "review" || j.stage === "approve" || j.stage === "send") ready += 1;
    else inProgress += 1;
  }
  const created = journeys.map((x) => x.draft.createdAt);
  return {
    ready,
    inProgress,
    sent,
    lastSentAt: lastSentAt || null,
    startedThisMonth: created.filter((t) => t >= monthStart).length,
    startedWeekly: weeklySeries(created),
  };
}
