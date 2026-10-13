import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronRight, CircleHelp, Search, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { useProfileStore } from "@/lib/profile";
import { shortOrgName } from "@/components/AppSidebar";
import { BTN_LG, BTN_OUTLINE } from "@/components/consultants/ui";
import { cn } from "@/lib/utils";

export type HeaderCrumb = { label: string; href?: string };

/** The real workspace name, as the sidebar shows it ("Harbour Foods"). */
export function useWorkspaceName(): string {
  const { activeTenant } = useAuth();
  const orgName = useProfileStore((s) => s.profile.employer.legalName);
  return shortOrgName(activeTenant?.name || orgName?.trim() || "DraftHR");
}

/**
 * The Experts band (design `experts`, `bookings`, `mk-market`): the mist wash
 * running the full width of the page with a hairline under it, crumbs, the
 * serif title, the lede, actions bottom-aligned on the right, and, on the
 * sidebar's Experts pages, the "Find an expert" and "My bookings" tabs along
 * its foot (routes, so the address changes and back and forward work).
 */
export function ExpertsHeader({
  crumbs,
  title,
  lede,
  actions,
  tab,
  toPay = 0,
  bottom,
}: {
  crumbs: HeaderCrumb[];
  title: string;
  lede: ReactNode;
  actions?: ReactNode;
  /** Show the tabs, with this one selected. */
  tab?: "find" | "bookings";
  /** Bookings waiting for you to pay: the amber "<n> to pay" badge. */
  toPay?: number;
  /** Other tabs along the band's foot (the admin queue's status tabs). */
  bottom?: ReactNode;
}) {
  return (
    <header
      data-slot="page-header"
      className={cn(
        "relative isolate border-b border-[var(--ds-line-2)] px-4 pt-6 sm:px-8 md:px-12 md:pt-[34px]",
        !tab && !bottom && "pb-7",
      )}
      style={{ background: "var(--ds-mist)" }}
    >
      <nav aria-label="Breadcrumb" className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[13px] leading-4 text-[var(--ds-muted)]">
        {crumbs.map((c, i) => (
          <span key={i} className="flex min-w-0 items-center gap-2">
            {c.href ? (
              <Link
                to={c.href}
                className="max-w-[46vw] truncate rounded-[4px] transition-colors duration-[120ms] hover:text-[var(--ds-ink)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)] sm:max-w-none"
              >
                {c.label}
              </Link>
            ) : (
              <span className="max-w-[46vw] truncate sm:max-w-none" aria-current={i === crumbs.length - 1 ? "page" : undefined}>
                {c.label}
              </span>
            )}
            {i < crumbs.length - 1 && <ChevronRight aria-hidden className="size-[13px] shrink-0 text-[var(--ds-subtle)]" />}
          </span>
        ))}
      </nav>
      <div className="mt-2.5 flex min-w-0 flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0 flex-1 basis-[320px]">
          <h1 className="ds-title m-0 text-[34px] leading-[1.08] [overflow-wrap:anywhere] [font-variation-settings:'opsz'_72] md:text-[46px] md:leading-[1.05]">
            {title}
          </h1>
          <p className="m-0 mt-2.5 text-[15px] leading-[1.3] text-[var(--ds-muted)]">{lede}</p>
        </div>
        {actions && (
          <div className="flex w-full flex-wrap items-center gap-2.5 md:w-auto md:flex-nowrap md:pb-1.5">{actions}</div>
        )}
      </div>
      {tab && <ExpertsTabs active={tab} toPay={toPay} />}
      {!tab && bottom}
    </header>
  );
}

/** "Find an expert" and "My bookings", with the underline sliding across. */
function ExpertsTabs({ active, toPay }: { active: "find" | "bookings"; toPay: number }) {
  const loc = useLocation();
  const from = (loc.state as { expertsTab?: string } | null)?.expertsTab;
  const findRef = useRef<HTMLAnchorElement>(null);
  const bookRef = useRef<HTMLAnchorElement>(null);
  const [bar, setBar] = useState<{ left: number; width: number; animate: boolean } | null>(null);

  useLayoutEffect(() => {
    const target = active === "find" ? findRef.current : bookRef.current;
    const origin = from && from !== active ? (from === "find" ? findRef.current : bookRef.current) : null;
    if (!target) return;
    const place = (el: HTMLElement, animate: boolean) => setBar({ left: el.offsetLeft, width: el.offsetWidth, animate });
    if (origin) {
      place(origin, false);
      const id = requestAnimationFrame(() => requestAnimationFrame(() => place(target, true)));
      return () => cancelAnimationFrame(id);
    }
    place(target, false);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => place(target, false)) : null;
    ro?.observe(target);
    return () => ro?.disconnect();
  }, [active, from]);

  const tabCls = (on: boolean) =>
    cn(
      "inline-flex items-center whitespace-nowrap px-3 pt-[7px] pb-3 text-[14px] leading-[19px] transition-colors duration-[120ms] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)] rounded-t-[6px]",
      on ? "font-medium text-[var(--ds-ink)]" : "text-[var(--ds-muted)] hover:text-[var(--ds-ink)]",
    );

  return (
    <nav aria-label="Experts" className="no-scrollbar relative -mb-px mt-[26px] flex gap-1 overflow-x-auto">
      <Link
        ref={findRef}
        to="/consultants"
        state={{ expertsTab: active }}
        aria-current={active === "find" ? "page" : undefined}
        className={tabCls(active === "find")}
      >
        Find an expert
      </Link>
      <Link
        ref={bookRef}
        to="/bookings"
        state={{ expertsTab: active }}
        aria-current={active === "bookings" ? "page" : undefined}
        className={tabCls(active === "bookings")}
      >
        My bookings
        {toPay > 0 && (
          <span className="ml-1.5 rounded-[5px] bg-[var(--ds-amber-bg)] px-1.5 py-px text-[12px] font-medium text-[var(--ds-amber-fg)]">
            {toPay} to pay
          </span>
        )}
      </Link>
      {bar && (
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute bottom-0 h-0.5 bg-[var(--ds-ink)]",
            bar.animate && "transition-[left,width] duration-200 ease-out motion-reduce:transition-none",
          )}
          style={{ left: bar.left, width: bar.width }}
        />
      )}
    </nav>
  );
}

/** The band's search field (260 x 38, magnifier, clear button while typed). */
export function ExpertSearch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative w-full md:w-[260px]">
      <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--ds-subtle)]" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search by name or role"
        aria-label="Search specialists by name or role"
        className="h-[38px] w-full appearance-none rounded-[9px] border border-[var(--ds-line)] bg-[var(--ds-surface)] pl-[38px] pr-9 text-[14px] text-[var(--ds-ink)] placeholder:text-[var(--ds-subtle)] transition-colors duration-[120ms] hover:border-[var(--ds-line-strong)] focus:border-[var(--ds-line-hover)] focus:outline-none focus-visible:shadow-[var(--ds-focus-ring)] [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-[6px] text-[var(--ds-subtle)] transition-colors duration-[120ms] hover:bg-[var(--ds-surface-2)] hover:text-[var(--ds-ink)]"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      )}
    </div>
  );
}

/** "How it works": the booking in plain words, matching the real payment rules. */
export function HowItWorks() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button type="button" className={cn(BTN_OUTLINE, BTN_LG)}>
          <CircleHelp className="size-4" aria-hidden />
          How it works
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader className="text-left">
          <DialogTitle className="ds-heading text-[24px] font-normal">How booking an expert works</DialogTitle>
          <DialogDescription className="text-[13.5px] text-[var(--ds-muted)]">
            A qualified employment law specialist checks your letter before it goes out.
          </DialogDescription>
        </DialogHeader>
        <ol className="m-0 flex list-none flex-col gap-3 p-0 text-[14px] leading-[1.5] text-[var(--ds-body)]">
          {[
            ["Pick an expert and a letter.", "Tell them what you want checked. Your letter goes into Review and editing pauses while it's with them."],
            ["They accept or decline.", "Nothing is charged when you send the request. If they decline, the request closes and you pay nothing."],
            ["You pay once they accept.", "Pay the fee shown through secure checkout. Their review starts once the payment clears."],
            ["They suggest changes in the letter.", "Their suggestions and comments show in the letter. You decide what to keep."],
            ["Rate the review.", "When it's back, you can rate it from My bookings."],
          ].map(([lead, rest], i) => (
            <li key={i} className="flex gap-3">
              <span className="ds-mono mt-px grid size-6 shrink-0 place-items-center rounded-full bg-[var(--ds-surface-2)] text-[12px] font-medium text-[var(--ds-ink)]">
                {i + 1}
              </span>
              <span>
                <span className="font-medium text-[var(--ds-ink)]">{lead}</span> {rest}
              </span>
            </li>
          ))}
        </ol>
      </DialogContent>
    </Dialog>
  );
}
