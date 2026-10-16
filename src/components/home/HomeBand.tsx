/**
 * The Home header band (mocks home, approvals, calendar: `homeBand`): the
 * mist wash edge to edge of the main area, the breadcrumb, the greeting,
 * a summary line that follows the tab, the team's avatars, New matter and
 * New letter, and the tab row Overview, Needs approval, Calendar, Activity.
 *
 * Each tab is its own address (/hr, /approvals, /calendar, /activity). The
 * routes are separate components, so the band is drawn by each of them;
 * it looks identical, and the underline slides from the tab you came from
 * (remembered here between mounts) to the new one.
 */
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CalendarDays, ChevronRight, ClipboardCheck, FolderPlus, History, Plus, type LucideIcon } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useProfileStore } from "@/lib/profile";
import { avatarColor, avatarInitials, avatarInk } from "@/components/ds";
import { cn } from "@/lib/utils";
import { firstNameOf, greetingFor } from "./homeData";
import { useLettersLoading } from "./loadState";

export type HomeTabId = "overview" | "approvals" | "calendar" | "activity";

const TABS: Array<{ id: HomeTabId; label: string; href: string }> = [
  { id: "overview", label: "Overview", href: "/hr" },
  { id: "approvals", label: "Needs approval", href: "/approvals" },
  { id: "calendar", label: "Calendar", href: "/calendar" },
  { id: "activity", label: "Activity", href: "/activity" },
];

/** Shared button looks (mock .btn: 38px, 9px corners, 14.5px medium). */
export const BAND_BTN_DARK =
  "inline-flex h-[38px] shrink-0 items-center gap-[7px] whitespace-nowrap rounded-[9px] bg-[var(--ds-accent)] px-3.5 text-[14.5px] font-medium text-[var(--ds-on-accent)] transition-colors duration-[120ms] hover:bg-[var(--ds-accent-hover)] active:bg-[var(--ds-accent-press)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ds-focus)] disabled:pointer-events-none disabled:opacity-40";
export const BAND_BTN_GHOST =
  "inline-flex h-[38px] shrink-0 items-center gap-[7px] whitespace-nowrap rounded-[9px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-3.5 text-[14.5px] font-medium text-[var(--ds-ink)] transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] active:bg-[var(--ds-surface-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ds-focus)] disabled:pointer-events-none disabled:opacity-40";

/** Short workspace name for breadcrumbs ("Harbour Foods"). */
export function useWorkspaceName(): string {
  const { activeTenant } = useAuth();
  const org = useProfileStore((s) => s.profile.employer.legalName);
  const full = activeTenant?.name || org?.trim() || "Your workspace";
  return full.replace(/\s+(ltd\.?|limited|plc|llp|inc\.?|llc)$/i, "").trim() || full;
}

export function useGreeting(): string {
  const profile = useProfileStore((s) => s.profile);
  return greetingFor(new Date(), firstNameOf(profile));
}

/**
 * The mist band. On phones it climbs behind the transparent top bar so the
 * wash runs to the top of the screen (mock phone-home `.top`).
 */
export function Band({
  crumbs,
  title,
  lede,
  actions,
  tabs,
  notice,
  className,
}: {
  /** A banner at the very top of the band, above the title. */
  notice?: ReactNode;
  crumbs?: Array<{ label: string; href?: string }>;
  title: ReactNode;
  lede?: ReactNode;
  actions?: ReactNode;
  tabs?: ReactNode;
  className?: string;
}) {
  return (
    <section
      data-slot="home-band"
      className={cn(
        "relative -mt-[52px] border-b border-[var(--ds-line-2)] px-5 pt-[70px] [background:var(--ds-mist-phone)] md:mt-0 md:px-12 md:pt-[34px] md:[background:var(--ds-mist)]",
        // On phones the band climbs behind the transparent top bar. When the
        // storage warning sits between them, stay below it instead of
        // drawing over it.
        "max-md:[main:has(>[data-testid=storage-quota-banner])_&]:mt-3 max-md:[main:has(>[data-testid=storage-quota-banner])_&]:pt-6",
        !tabs && "pb-[22px] md:pb-7",
        className
      )}
    >
      {notice && <div className="mb-5 md:mb-6">{notice}</div>}
      {crumbs && crumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-2 text-[13px] leading-4 text-[var(--ds-muted)] md:flex">
          {crumbs.map((c, i) => (
            <span key={i} className="flex min-w-0 items-center gap-2">
              {c.href ? (
                <Link to={c.href} className="truncate rounded-[4px] transition-colors duration-[120ms] hover:text-[var(--ds-ink)]">
                  {c.label}
                </Link>
              ) : (
                <span className="truncate">{c.label}</span>
              )}
              {i < crumbs.length - 1 && <ChevronRight aria-hidden className="size-[13px] shrink-0 text-[var(--ds-subtle)]" />}
            </span>
          ))}
        </nav>
      )}
      <div className="flex min-w-0 flex-wrap items-end justify-between gap-x-6 gap-y-4 md:mt-2.5">
        <div className="min-w-0 flex-1 basis-[300px]">
          <h1 className="ds-title m-0 min-w-0 text-[34px] leading-[1.08] tracking-[-0.022em] [overflow-wrap:anywhere] [font-variation-settings:'opsz'_72] md:text-[46px] md:leading-[1.05]">
            {title}
          </h1>
          {lede && (
            <p className="m-0 mt-2 max-w-[680px] text-[14.5px] leading-[1.35] text-[var(--ds-muted)] md:mt-2.5 md:text-[15px] [&_b]:font-medium [&_b]:text-[var(--ds-ink)]">
              {lede}
            </p>
          )}
        </div>
        {actions && <div className="hidden shrink-0 flex-wrap items-center gap-2.5 pb-1.5 md:flex">{actions}</div>}
      </div>
      {tabs}
    </section>
  );
}

/* ─── Team avatars ─────────────────────────────────────────────────── */

type Member = { userId: string; email: string | null; legalName: string | null };

/**
 * Real workspace members (up to three, then +N). Hidden for a team of one,
 * and when the list cannot be loaded (no server, signed out, an error):
 * never made-up initials. The request is made whenever the page mounts, so
 * it works in any set-up that serves /api/workspace/members.
 */
function MemberStack() {
  const { activeTenant } = useAuth();
  const [members, setMembers] = useState<Member[] | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/workspace/members", { credentials: "same-origin" })
      .then(async (r) => {
        const type = r.headers.get("content-type") ?? "";
        // A dev server or static host answers with the app's HTML: no list.
        if (!r.ok || !type.includes("application/json")) return { members: [] };
        return r.json();
      })
      .then((j) => live && setMembers(((j?.members ?? []) as Member[]).filter((m) => m && (m.userId || m.email))))
      .catch(() => live && setMembers([]));
    return () => {
      live = false;
    };
    // Reload when the person switches workspace.
  }, [activeTenant?.id]);
  if (!members || members.length < 2) return null;
  const shown = members.slice(0, 3);
  const more = members.length - shown.length;
  return (
    <Link
      to="/settings?tab=team"
      aria-label={`${members.length} people in this workspace, open Team settings`}
      title="Your team"
      className="mr-1.5 flex rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ds-focus)]"
    >
      {shown.map((m, i) => {
        const seed = m.email ?? m.userId;
        return (
          <span
            key={m.userId || seed}
            className={cn(
              "grid size-[30px] place-items-center rounded-full border-2 border-[var(--ds-surface)] text-[10px] font-semibold",
              i > 0 && "-ml-1.5"
            )}
            style={{ background: avatarColor(seed), color: avatarInk(seed) }}
          >
            {avatarInitials(m.legalName ?? undefined, m.email ?? undefined)}
          </span>
        );
      })}
      {more > 0 && (
        <span className="-ml-1.5 grid size-[30px] place-items-center rounded-full border-2 border-[var(--ds-surface)] bg-[var(--ds-av-6)] text-[10px] font-semibold text-[var(--ds-av-6-fg)]">
          +{more}
        </span>
      )}
    </Link>
  );
}

/* ─── Tabs ─────────────────────────────────────────────────────────── */

/**
 * Each Home tab is its own route, so switching tabs mounts a new band. Two
 * things carry over from the band being left: where the underline sat (so
 * the new one can slide from there) and, when the switch was made with the
 * keyboard, which tab should hold focus (so a keyboard user keeps their
 * place instead of dropping to the page body).
 */
let lastBar: { left: number; width: number } | null = null;
let focusTabOnMount: HomeTabId | null = null;

function HomeTabs({ active, approvals }: { active: HomeTabId; approvals: number }) {
  const nav = useNavigate();
  const wrap = useRef<HTMLDivElement>(null);
  const refs = useRef<Record<string, HTMLAnchorElement | null>>({});
  // Start where the previous band's underline was, without a transition.
  // Kept in a ref (not read again from the module) so a second run of the
  // effect (React's development double run) still slides from there.
  const from = useRef(lastBar);
  const [bar, setBar] = useState<{ left: number; width: number; animate: boolean } | null>(
    lastBar ? { ...lastBar, animate: false } : null
  );

  // Keyboard switch: put focus on the new tab once it is on screen.
  useLayoutEffect(() => {
    if (focusTabOnMount !== active) return;
    focusTabOnMount = null;
    refs.current[active]?.focus({ preventScroll: true });
  }, [active]);

  useLayoutEffect(() => {
    const read = () => {
      const el = refs.current[active];
      return el ? { left: el.offsetLeft, width: el.offsetWidth } : null;
    };
    let raf1 = 0;
    let raf2 = 0;
    const first = read();
    if (first) {
      const start = from.current;
      if (!start || (start.left === first.left && start.width === first.width)) {
        setBar({ ...first, animate: false });
      } else {
        // The old position has been painted (state above); turn the
        // transition on, then move on the frame after so it slides.
        raf1 = requestAnimationFrame(() => {
          setBar((b) => (b ? { ...b, animate: true } : b));
          raf2 = requestAnimationFrame(() => {
            from.current = null;
            setBar({ ...first, animate: true });
          });
        });
      }
      lastBar = first;
    }
    // Later size changes (fonts, the count badge, the window) move it
    // without a slide; the observer's first call reports nothing new.
    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            const next = read();
            if (!next || (lastBar && next.left === lastBar.left && next.width === lastBar.width)) return;
            lastBar = next;
            setBar({ ...next, animate: false });
          })
        : null;
    if (ro && wrap.current) ro.observe(wrap.current);
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      ro?.disconnect();
    };
  }, [active, approvals]);

  const go = (id: HomeTabId, href: string, fromKeyboard: boolean) => {
    if (id === active) return;
    if (fromKeyboard) focusTabOnMount = id;
    nav(href);
  };

  const onKey = (e: KeyboardEvent<HTMLAnchorElement>, i: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const n =
      e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : (i + (e.key === "ArrowRight" ? 1 : -1) + TABS.length) % TABS.length;
    refs.current[TABS[n].id]?.focus();
    go(TABS[n].id, TABS[n].href, true);
  };

  return (
    <div
      className={cn(
        "no-scrollbar -mx-5 mt-5 overflow-x-auto px-5 md:mx-0 md:mt-[26px] md:overflow-visible md:px-0",
        // Phone Home (mock phone-home) has no tab row: Needs approval,
        // Calendar and Activity are the links under Needs you
        // (PhoneHomeTabLinks). The other tabs keep it, so a phone user can
        // come back to Overview.
        active === "overview" && "max-md:hidden"
      )}
    >
      <nav ref={wrap} aria-label="Home sections" className="relative flex w-max gap-1">
        {TABS.map((t, i) => {
          const on = t.id === active;
          const count = t.id === "approvals" ? approvals : 0;
          return (
            <Link
              key={t.id}
              ref={(el) => {
                refs.current[t.id] = el;
              }}
              to={t.href}
              aria-current={on ? "page" : undefined}
              onKeyDown={(e) => onKey(e, i)}
              onClick={(e) => {
                // Enter on a focused tab arrives as a click with no pointer
                // (detail 0): keep focus on the tab after the switch.
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                e.preventDefault();
                go(t.id, t.href, e.detail === 0);
              }}
              className={cn(
                "inline-flex items-center whitespace-nowrap rounded-t-[6px] px-3 pt-[7px] pb-3 text-[14px] leading-[17px] transition-colors duration-[120ms] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--ds-focus)]",
                on ? "font-medium text-[var(--ds-ink)]" : "text-[var(--ds-muted)] hover:text-[var(--ds-ink)]"
              )}
            >
              {t.label}
              {count > 0 && (
                <span
                  aria-label={`${count} waiting`}
                  className={cn(
                    "ml-[7px] inline-grid h-[18px] min-w-[19px] place-items-center rounded-[9px] px-[5px] text-[11.5px] font-medium",
                    on ? "bg-[var(--ds-ink)] text-[var(--ds-on-accent)]" : "bg-[var(--ds-chip)] text-[var(--ds-muted)]"
                  )}
                >
                  {count}
                </span>
              )}
            </Link>
          );
        })}
        {bar && (
          <span
            aria-hidden
            data-tab-underline
            className={cn(
              "pointer-events-none absolute bottom-[-1px] left-0 h-[2px] bg-[var(--ds-ink)] motion-reduce:transition-none",
              bar.animate && "transition-[transform,width] duration-[160ms] ease-[cubic-bezier(0.4,0,0.2,1)]"
            )}
            style={{ width: bar.width, transform: `translateX(${bar.left}px)` }}
          />
        )}
      </nav>
    </div>
  );
}

const TAB_ICONS: Partial<Record<HomeTabId, LucideIcon>> = {
  approvals: ClipboardCheck,
  calendar: CalendarDays,
  activity: History,
};

/**
 * Phone Home has no tab row (mock phone-home), so the other Home tabs are
 * small links instead: Needs approval (with the same count as the tab's
 * badge), Calendar and Activity. Hidden from md up, where the tabs show.
 */
export function PhoneHomeTabLinks({ approvals, className }: { approvals: number; className?: string }) {
  return (
    <nav aria-label="More on Home" className={cn("flex flex-wrap gap-1.5 md:hidden", className)}>
      {TABS.filter((t) => t.id !== "overview").map((t) => {
        const Icon = TAB_ICONS[t.id];
        const count = t.id === "approvals" ? approvals : 0;
        return (
          <Link
            key={t.id}
            to={t.href}
            className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-[9px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-2 text-[13px] text-[var(--ds-ink)] transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] active:bg-[var(--ds-surface-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ds-focus)]"
          >
            {Icon && <Icon className="size-3.5 shrink-0 text-[var(--ds-muted)]" aria-hidden />}
            {t.label}
            {count > 0 && (
              <span
                aria-label={`${count} waiting`}
                className="inline-grid h-[18px] min-w-[19px] place-items-center rounded-[9px] bg-[var(--ds-chip)] px-[5px] text-[11.5px] font-medium text-[var(--ds-muted)]"
              >
                {count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Tabs at the foot of a band that switch content on the same page
 * (Notifications, Reports). Same look as the Home tabs, with the count
 * after the label and the underline sliding between tabs.
 */
export function BandTabs({
  tabs,
  active,
  onChange,
  label,
}: {
  tabs: Array<{ id: string; label: string; count?: number }>;
  active: string;
  onChange: (id: string) => void;
  label: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [bar, setBar] = useState<{ left: number; width: number; animate: boolean } | null>(null);
  const seen = useRef(false);
  useLayoutEffect(() => {
    const measure = (animate: boolean) => {
      const el = refs.current[active];
      if (!el) return;
      setBar({ left: el.offsetLeft, width: el.offsetWidth, animate });
    };
    measure(seen.current);
    seen.current = true;
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => measure(false)) : null;
    if (ro && wrap.current) ro.observe(wrap.current);
    return () => ro?.disconnect();
    // Re-measure when the labels or counts change, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, tabs.map((t) => `${t.id}:${t.label}:${t.count ?? ""}`).join("|")]);
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const n =
      e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : (i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    refs.current[tabs[n].id]?.focus();
    onChange(tabs[n].id);
  };
  return (
    <div className="no-scrollbar -mx-5 mt-5 overflow-x-auto px-5 md:mx-0 md:mt-[26px] md:overflow-visible md:px-0">
      <div ref={wrap} role="tablist" aria-label={label} className="relative flex w-max gap-1">
        {tabs.map((t, i) => {
          const on = t.id === active;
          return (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[t.id] = el;
              }}
              type="button"
              role="tab"
              aria-selected={on}
              tabIndex={on ? 0 : -1}
              onClick={() => onChange(t.id)}
              onKeyDown={(e) => onKey(e, i)}
              className={cn(
                "inline-flex items-center whitespace-nowrap rounded-t-[6px] px-3 pt-[7px] pb-3 text-[14px] leading-[17px] transition-colors duration-[120ms] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--ds-focus)]",
                on ? "font-medium text-[var(--ds-ink)]" : "text-[var(--ds-muted)] hover:text-[var(--ds-ink)]"
              )}
            >
              {t.label}
              {t.count != null && (
                <span
                  className={cn(
                    "ml-[7px] inline-grid h-[18px] min-w-[19px] place-items-center rounded-[9px] px-[5px] text-[11.5px] font-medium",
                    on ? "bg-[var(--ds-ink)] text-[var(--ds-on-accent)]" : "bg-[var(--ds-chip)] text-[var(--ds-muted)]"
                  )}
                >
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
        {bar && (
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute bottom-[-1px] left-0 h-[2px] bg-[var(--ds-ink)] motion-reduce:transition-none",
              bar.animate && "transition-[transform,width] duration-[160ms] ease-[cubic-bezier(0.4,0,0.2,1)]"
            )}
            style={{ width: bar.width, transform: `translateX(${bar.left}px)` }}
          />
        )}
      </div>
    </div>
  );
}

/** Warm the other tabs' code so switching tabs never waits on a download. */
function usePrefetchTabs() {
  useEffect(() => {
    const t = window.setTimeout(() => {
      void import("@/routes/Approvals");
      void import("@/routes/Calendar");
      void import("@/routes/Activity");
      void import("@/routes/Home");
    }, 300);
    return () => window.clearTimeout(t);
  }, []);
}

/** The Home band for HR users, with the tab row. */
export function HomeBand({
  active,
  lede,
  approvals,
  notice,
}: {
  active: HomeTabId;
  lede: ReactNode;
  /** A banner above the title (the employee directory import). */
  notice?: ReactNode;
  /** Letters waiting for sign-off (the Needs approval badge). */
  approvals: number;
}) {
  const workspace = useWorkspaceName();
  const greeting = useGreeting();
  // While the first pull is still bringing letters to an empty device the
  // counts would read as "nothing yet", so the lede says what is happening.
  const loading = useLettersLoading();
  usePrefetchTabs();
  return (
    <Band
      notice={notice}
      crumbs={[{ label: workspace }, { label: "HR team" }]}
      title={greeting}
      lede={loading ? "Getting your letters from the workspace." : lede}
      actions={
        <>
          <MemberStack />
          <Link to="/matters" className={BAND_BTN_GHOST}>
            <FolderPlus className="size-4" aria-hidden />
            New matter
          </Link>
          <Link to="/hr/new" className={BAND_BTN_DARK} data-tour="new-letter-cta">
            <Plus className="size-4" aria-hidden />
            New letter
          </Link>
        </>
      }
      tabs={<HomeTabs active={active} approvals={approvals} />}
      // Without the tab row on phone Home the band ends after the summary
      // line, with the mock's 22px below it and no rule.
      className={active === "overview" ? "max-md:border-b-0 max-md:pb-[22px]" : undefined}
    />
  );
}

/**
 * "<b>3 letters</b> in progress, <b>1</b> needs you today." The second
 * number is the Letters page's "Needs you" count (the same rule).
 *
 * Deliberate change from the mock (and HOME-04), noted for Edem: the mock
 * says "<M> needs your review today", but this count also holds letters
 * that are not a review (for example "Send · ready" and drafts with a
 * check to fix), so it says "needs you" rather than "needs your review".
 */
export function OverviewLede({ inProgress, needYou }: { inProgress: number; needYou: number }) {
  if (inProgress === 0 && needYou === 0) return <>Nothing in progress yet. Start a letter when you need one.</>;
  return (
    <>
      <b>
        {inProgress} {inProgress === 1 ? "letter" : "letters"}
      </b>{" "}
      in progress
      {needYou > 0 ? (
        <>
          , <b>{needYou}</b> {needYou === 1 ? "needs" : "need"} you today.
        </>
      ) : (
        "."
      )}
    </>
  );
}
